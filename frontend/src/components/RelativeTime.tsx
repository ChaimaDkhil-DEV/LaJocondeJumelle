import Box from '@mui/material/Box';
import { formatDateTime, formatRelative } from './format';

/** Date relative (« il y a 5 min ») ; la date complète reste disponible au survol et pour les machines. */
export function RelativeTime({ value }: { value: string }) {
  return (
    <Box component="time" dateTime={value} title={formatDateTime(value)} sx={{ whiteSpace: 'nowrap' }}>
      {formatRelative(value)}
    </Box>
  );
}
