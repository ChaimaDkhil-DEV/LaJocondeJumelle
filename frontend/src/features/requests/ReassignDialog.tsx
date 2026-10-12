import { ApprovalDialog } from './ApprovalDialog';

interface ReassignDialogProps {
  open: boolean;
  requestId: string;
  currentAssigneeId?: string;
  pending?: boolean;
  onConfirm: (assigneeId: string) => void;
  onClose: () => void;
}

/** Réaffectation par un responsable (FR-027) : choix parmi les destinataires de la catégorie. */
export function ReassignDialog({ open, requestId, currentAssigneeId, pending, onConfirm, onClose }: ReassignDialogProps) {
  return (
    <ApprovalDialog
      open={open}
      requestId={requestId}
      mode="reassign"
      excludeId={currentAssigneeId}
      pending={pending}
      onConfirm={(assigneeId) => assigneeId && onConfirm(assigneeId)}
      onClose={onClose}
    />
  );
}
