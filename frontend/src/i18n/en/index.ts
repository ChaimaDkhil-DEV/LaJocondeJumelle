import { admin } from './admin';
import { api } from './api';
import { assist } from './assist';
import { attendance } from './attendance';
import { auth } from './auth';
import { avatar } from './avatar';
import { common } from './common';
import { coverage } from './coverage';
import { dashboard } from './dashboard';
import { imports } from './imports';
import { notifications } from './notifications';
import { outbox } from './outbox';
import { push } from './push';
import { requests } from './requests';
import { shared } from './shared';
import { students } from './students';
import { thread } from './thread';
import { voice } from './voice';

/** English translations, keyed by the French text used in the interface. */
export const en: Record<string, string> = {
  ...api,
  ...shared,
  ...requests,
  ...coverage,
  ...imports,
  ...attendance,
  ...admin,
  ...dashboard,
  ...thread,
  ...voice,
  ...notifications,
  ...avatar,
  ...students,
  ...assist,
  ...outbox,
  ...push,
  ...auth,
  ...common,
};
