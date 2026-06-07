export type ThemeMode = "dark" | "light" | "system";

export type User = {
  id: string;
  identifier: string;
  display_name: string;
  theme: Exclude<ThemeMode, "system">;
  role: "user" | "admin" | "super_admin";
  is_active: boolean;
  password_set: boolean;
  created_at: string;
};

export type AuthResponse = {
  user: User;
  access_token?: string | null;
  redirect_to: string;
};

export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message?: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type ChatResponse = {
  reply: string;
  conversation: Conversation;
  messages: Message[];
  assistant_message: Message;
};

export type ChatStreamReady = {
  conversation: Conversation;
  user_message: Message;
};

export type BrainStatus = {
  database: string;
  groq: string;
  openrouter: string;
  ollama: string;
};
