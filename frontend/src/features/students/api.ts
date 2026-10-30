import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';

/** Service de restauration : exactement un par élève. */
export type MealService = 'CANTINE' | 'PANIER';

export const MEAL_SERVICE_LABELS: Record<MealService, string> = { CANTINE: 'Cantine', PANIER: 'Panier' };

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
  cycle: 'PREPARATORY' | 'PRIMARY';
  position: number;
  classes: LevelClass[];
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
