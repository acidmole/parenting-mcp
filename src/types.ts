// Wilma CLI JSON output types (inferred from wilma-cli)

export interface WilmaStudent {
  id: string;
  name: string;
}

export interface WilmaScheduleEntry {
  time: string;
  subject: string;
  teacher?: string;
  room?: string;
  student?: string;
}

export interface WilmaExam {
  date: string;
  subject: string;
  description?: string;
  student?: string;
}

export interface WilmaHomework {
  dueDate?: string;
  subject: string;
  description: string;
  student?: string;
}

export interface WilmaNewsItem {
  id: number | string;
  title: string;
  date: string;
  content?: string;
  sender?: string;
}

export interface WilmaMessage {
  id: number | string;
  subject: string;
  sender: string;
  date: string;
  content?: string;
}

// WhatsApp types

export interface WhatsAppContact {
  jid: string;
  name: string;
  notify?: string;
}

export interface WhatsAppGroup {
  jid: string;
  name: string;
  participantCount: number;
}
