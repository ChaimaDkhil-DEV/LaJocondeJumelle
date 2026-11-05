import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { t } from '../../i18n';
import type { ImportReport } from '../admin/csvImport';

/** Service de restauration : exactement un par élève. */
export type MealService = 'CANTINE' | 'PANIER';

export const MEAL_SERVICE_LABELS: Record<MealService, string> = { CANTINE: t('Cantine'), PANIER: t('Panier') };

export type Cycle = 'PREPARATORY' | 'PRIMARY';

export const CYCLE_LABELS: Record<Cycle, string> = { PREPARATORY: t('Préparatoire'), PRIMARY: t('Primaire') };

export interface LevelClass {
  id: string;
  name: string;
  room: string | null;
  floor: { id: string; name: string } | null;
  studentCount: number;
}

export interface GradeLevel {
  id: string;
  name: string;
  cycle: Cycle;
  position: number;
  classes: LevelClass[];
}

export interface LevelInput {
  id?: string;
  name: string;
  cycle: Cycle;
  position: number;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  parentPhone: string;
  mealService: MealService;
  active: boolean;
  class: { id: string; name: string; level: { id: string; name: string; position: number } | null };
}

export interface StudentInput {
  id?: string;
  firstName: string;
  lastName: string;
  classId: string;
  parentPhone: string;
  mealService: MealService;
  active?: boolean;
}

export const studentKeys = {
  levels: ['admin', 'levels'] as const,
  students: ['admin', 'students'] as const,
};

export function useLevels() {
  return useQuery({ queryKey: studentKeys.levels, queryFn: () => apiFetch<GradeLevel[]>('/api/admin/levels') });
}

/** Crée ou modifie un niveau ; les listes de classes (qui affichent le niveau) sont rafraîchies aussi. */
export function useSaveLevel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: LevelInput) =>
      apiFetch<GradeLevel[]>(id ? `/api/admin/levels/${id}` : '/api/admin/levels', { method: id ? 'PATCH' : 'POST', body }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: studentKeys.levels });
      void queryClient.invalidateQueries({ queryKey: studentKeys.students });
      void queryClient.invalidateQueries({ queryKey: ['coverage', 'admin', 'classes'] });
    },
  });
}

/** Import d'élèves depuis un fichier CSV : `dryRun` vrai vérifie sans rien créer. Rafraîchit les listes si tout est créé. */
export function useImportStudents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ csv, dryRun }: { csv: string; dryRun: boolean }) =>
      apiFetch<ImportReport>('/api/admin/students/import', { method: 'POST', body: { csv, dryRun } }),
    onSuccess: (report) => {
      if (!report.created) return;
      void queryClient.invalidateQueries({ queryKey: studentKeys.students });
      void queryClient.invalidateQueries({ queryKey: studentKeys.levels });
    },
  });
}

export function useStudents() {
  return useQuery({ queryKey: studentKeys.students, queryFn: () => apiFetch<Student[]>('/api/admin/students') });
}

export function useSaveStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: StudentInput) =>
      apiFetch<Student>(id ? `/api/admin/students/${id}` : '/api/admin/students', { method: id ? 'PATCH' : 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studentKeys.students });
      void queryClient.invalidateQueries({ queryKey: studentKeys.levels });
    },
  });
}
