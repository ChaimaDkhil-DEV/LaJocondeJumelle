import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';

interface ErrorStateProps {
  /** Ce qui ne va pas, en langage courant. */
  message: string;
  /** Action corrective proposée (ex. « Réessayer »). */
  actionLabel?: string;
  onAction?: () => void;
}

export function ErrorState({ message, actionLabel, onAction }: ErrorStateProps) {
  return (
    <Alert
      severity="error"
      role="alert"
      action={
        actionLabel && onAction ? (
          <Button color="inherit" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : undefined
      }
      sx={{ my: 2 }}
    >
      {message}
    </Alert>
  );
}
