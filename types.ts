
export type Sender = 'user' | 'bot';

export type Step = 'init' | 'consult' | 'dialog';

export interface BaseMessage {
    id: number;
    sender: Sender;
    text: string | null;
    imageUrl?: string | null;
}

export interface UserMessage extends BaseMessage {
    sender: 'user';
}

export interface BotMessage extends BaseMessage {
    sender: 'bot';
    audioUrl?: string | null;
}

export type ChatMessage = UserMessage | BotMessage;

export interface Recommendation {
    title: string;
    author: string;
}
