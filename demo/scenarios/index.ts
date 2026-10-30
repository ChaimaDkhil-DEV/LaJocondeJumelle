import type { Scenario } from '../lib/demo';
import { S01 } from './S01-menu-lateral';
import { S02 } from './S02-notifications';
import { S03 } from './S03-mes-demandes';
import { S04 } from './S04-nouvelle-demande';
import { S05 } from './S05-comptes';
import { S06 } from './S06-categories';
import { S07 } from './S07-groupes-classes';
import { S08 } from './S08-reglages';
import { S09 } from './S09-journal-audit';
import { S10 } from './S10-tableau-de-bord';
import { S11 } from './S11-suivi-gardes';
import { S12 } from './S12-affectation-surveillants';
import { S13 } from './S13-vue-surveillant';
import { P01 } from './P01-demande-vocale';
import { P02 } from './P02-validation-administration';
import { P03 } from './P03-refus-annulation';
import { P04 } from './P04-discussion';
import { P05 } from './P05-super-administrateur';

/** Scénarios de démonstration, dans l'ordre de la vidéo compilée. */
export const SCENARIOS: Scenario[] = [S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11, S12, S13];

/** Parcours d'une demande, de l'envoi vocal à la supervision (« npx tsx demo/run.ts parcours »). */
export const PARCOURS: Scenario[] = [P01, P02, P03, P04, P05];
