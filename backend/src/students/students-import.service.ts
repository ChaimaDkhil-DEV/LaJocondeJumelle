import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { normalizeText } from '../common/csv-parse';
import {
  buildReport,
  fileRefused,
  indexByName,
  readImportFile,
  resolveName,
  validateWithDto,
  type ColumnsSpec,
  type ImportCsvDto,
  type ImportReport,
  type ProcessedRow,
} from '../common/csv-import';
import { PrismaService } from '../common/prisma.service';
import { StudentDto } from './students.dto';
import type { StudentsContext } from './students.service';

/** Colonnes du fichier d'élèves ; le premier titre de chaque liste est celui du modèle téléchargeable. */
const COLUMNS: ColumnsSpec<'prenom' | 'nom' | 'classe' | 'telephone_parent'> = {
  prenom: { aliases: ['prenom', 'prenom_eleve', 'firstname'], required: true },
  nom: { aliases: ['nom', 'nom_eleve', 'nom_de_famille', 'nom_famille', 'lastname'], required: true },
  classe: { aliases: ['classe', 'class'], required: true },
  telephone_parent: {
    aliases: ['telephone_parent', 'telephone', 'tel', 'telephone_du_parent', 'telephone_d_un_parent', 'mobile_parent'],
    required: true,
  },
};

export const MAX_STUDENTS_PER_IMPORT = 2000;

/** Clé d'un élève dans une classe : deux fichiers (ou deux lignes) ne créent jamais le même élève deux fois. */
const studentKey = (classId: string, firstName: string, lastName: string) => `${classId}|${normalizeText(firstName)}|${normalizeText(lastName)}`;

interface PreparedStudent {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
  parentPhone: string;
}

/**
 * Import d'élèves depuis un fichier CSV. Tout ou rien, avec un aperçu qui ne crée rien. Les règles sont celles du
 * formulaire « Nouvel élève », et la classe doit être active et rattachée à un niveau scolaire.
 */
@Injectable()
export class StudentsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async run(dto: ImportCsvDto, ctx: StudentsContext): Promise<ImportReport> {
    const read = readImportFile(dto.csv, COLUMNS, MAX_STUDENTS_PER_IMPORT);
    if (read.fileErrors.length > 0) return fileRefused(dto.dryRun, read.fileErrors);

    const classes = await this.prisma.schoolClass.findMany({ select: { id: true, name: true, active: true, levelId: true } });
    const classIndex = indexByName(classes, (c) => c.name);

    // Élèves déjà inscrits dans les classes du fichier, pour refuser un fichier importé deux fois.
    const referenced = new Set<string>();
    for (const row of read.rows) {
      const found = classIndex.get(normalizeText(row.values.classe));
      if (found?.length === 1) referenced.add(found[0].id);
    }
    const enrolled = await this.prisma.student.findMany({
      where: { classId: { in: [...referenced] } },
      select: { classId: true, firstName: true, lastName: true },
    });
    const existing = new Set(enrolled.map((s) => studentKey(s.classId, s.firstName, s.lastName)));
    const seen = new Map<string, number>();

    const processed: ProcessedRow[] = [];
    const prepared: PreparedStudent[] = [];
    for (const row of read.rows) {
      const { values } = row;
      const errors = [...row.errors];
      const schoolClass = values.classe === '' ? null : resolveName(classIndex, values.classe, 'Classe', errors, true);
      if (values.classe === '') errors.push('La classe est obligatoire.');
      if (schoolClass && !schoolClass.active) errors.push(`La classe « ${schoolClass.name} » est désactivée.`);
      else if (schoolClass && !schoolClass.levelId) {
        errors.push(`La classe « ${schoolClass.name} » n’a pas de niveau scolaire : rattachez-la à un niveau (menu Classes) avant d’y inscrire des élèves.`);
      }

      // Mêmes règles que le formulaire : on passe par la classe de validation de l'élève.
      const checked = validateWithDto(StudentDto, {
        firstName: values.prenom,
        lastName: values.nom,
        classId: schoolClass?.id ?? '00000000-0000-4000-8000-000000000000',
        parentPhone: values.telephone_parent,
      });
      errors.push(...checked.errors);

      if (schoolClass && checked.value) {
        const key = studentKey(schoolClass.id, checked.value.firstName, checked.value.lastName);
        const first = seen.get(key);
        if (first !== undefined) errors.push(`Élève en double dans le fichier (déjà ligne ${first}).`);
        else seen.set(key, row.line);
        if (existing.has(key)) errors.push('Cet élève est déjà inscrit dans cette classe.');
      }

      const label = `${values.prenom} ${values.nom}`.trim() || `Ligne ${row.line}`;
      const detail = schoolClass?.name ?? '';
      processed.push({ line: row.line, label, detail, errors });
      if (errors.length === 0 && checked.value && schoolClass) {
        prepared.push({
          id: randomUUID(),
          firstName: checked.value.firstName,
          lastName: checked.value.lastName,
          classId: schoolClass.id,
          parentPhone: checked.value.parentPhone,
        });
      }
    }

    if (dto.dryRun || prepared.length !== processed.length) return buildReport(dto.dryRun, processed, false);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.student.createMany({ data: prepared.map((s) => ({ ...s, active: true })) });
        for (const student of prepared) {
          // Le journal ne garde aucune donnée personnelle d'élève : la classe et l'origine de la création seulement.
          await this.audit.log(
            'STUDENT_CHANGED',
            { actorId: ctx.actor.id, ip: ctx.ip, targetType: 'Student', targetId: student.id, details: { action: 'create', classId: student.classId, source: 'import' } },
            tx,
          );
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return buildReport(dto.dryRun, processed, true);
  }
}
