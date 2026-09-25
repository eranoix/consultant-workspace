// Every namespace is listed here once. Features own their JSON files;
// this file only wires them together.
import en_common from './messages/en/common.json';
import en_shell from './messages/en/shell.json';
import en_dashboard from './messages/en/dashboard.json';
import en_approvals from './messages/en/approvals.json';
import en_board from './messages/en/board.json';
import en_api from './messages/en/api.json';
import en_timeline from './messages/en/timeline.json';
import en_goals from './messages/en/goals.json';
import en_notes from './messages/en/notes.json';
import en_alerts from './messages/en/alerts.json';
import en_bookings from './messages/en/bookings.json';
import en_integrations from './messages/en/integrations.json';
import en_settings from './messages/en/settings.json';
import en_auth from './messages/en/auth.json';
import pt_common from './messages/pt/common.json';
import pt_shell from './messages/pt/shell.json';
import pt_dashboard from './messages/pt/dashboard.json';
import pt_approvals from './messages/pt/approvals.json';
import pt_board from './messages/pt/board.json';
import pt_api from './messages/pt/api.json';
import pt_timeline from './messages/pt/timeline.json';
import pt_goals from './messages/pt/goals.json';
import pt_notes from './messages/pt/notes.json';
import pt_alerts from './messages/pt/alerts.json';
import pt_bookings from './messages/pt/bookings.json';
import pt_integrations from './messages/pt/integrations.json';
import pt_settings from './messages/pt/settings.json';
import pt_auth from './messages/pt/auth.json';

export const LOCALES = ['en', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
export type Messages = Record<string, unknown>;

export const messages: Record<Locale, Messages> = {
  en: {
    common: en_common,
    shell: en_shell,
    dashboard: en_dashboard,
    approvals: en_approvals,
    board: en_board,
    api: en_api,
    timeline: en_timeline,
    goals: en_goals,
    notes: en_notes,
    alerts: en_alerts,
    bookings: en_bookings,
    integrations: en_integrations,
    settings: en_settings,
    auth: en_auth,
  },
  pt: {
    common: pt_common,
    shell: pt_shell,
    dashboard: pt_dashboard,
    approvals: pt_approvals,
    board: pt_board,
    api: pt_api,
    timeline: pt_timeline,
    goals: pt_goals,
    notes: pt_notes,
    alerts: pt_alerts,
    bookings: pt_bookings,
    integrations: pt_integrations,
    settings: pt_settings,
    auth: pt_auth,
  },
};
