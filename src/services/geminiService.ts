

import { GoogleGenAI, GenerateContentResponse, LiveServerMessage, Modality } from '@google/genai';
import { Step, UserAnswers, ChatMessage } from '../types.js';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const textModel = 'gemini-3-flash-preview';
const imageModel = 'gemini-2.5-flash-image';
const ttsModel = 'gemini-2.5-flash-preview-tts';
const liveModel = 'gemini-2.5-flash-native-audio-preview-12-2025';

const constructPrompt = (step: Step, answers: UserAnswers, history?: ChatMessage[], imageBase64?: string | null): any => {
    const systemInstruction = `Ты — "Литературный Сомелье", эмпатичный и вдохновляющий эксперт по подбору книг. Твои ответы должны быть лаконичными (до 150 слов). Ты строго следуешь рабочему процессу.
    
    Workflow:
    - init: Приветствие и вопрос о настроении.
    - q1-q4: Диагностика (динамика, жанр, любимое, особенности).
    - consult: Предоставление 3 рекомендаций на основе ответов.
    - dialog: Обсуждение рекомендаций, ответы на вопросы.
    
    Current State:
    - Step: ${step}
    - User Answers: ${JSON.stringify(answers)}
    `;

    if (step === 'consult' && history) {
        const formattedHistory = history.map(m => `${m.sender === 'user' ? 'Пользователь' : 'Сомелье'}: ${m.text}`).join('\n');
        return {
            model: textModel,
            contents: `Проанализируй весь предыдущий диалог, чтобы понять предпочтения пользователя:\n---\n${formattedHistory}\n---\n
Теперь, основываясь на всей собранной информации, дай 3 рекомендации книг. 
Для каждой рекомендации:
1. Укажи название и автора.
2. Кратко объясни, почему она подходит, связывая с ответами из диалога.
3. Добавь интригующий тизер (1-2 предложения).
Для ПЕРВОЙ книги в списке, добавь в конце описания специальный тег для генерации изображения, который описывает атмосферу книги. Формат: "[описание по настроению: твой текст описания]".`,
            config: { systemInstruction }
        };
    }
    
    if (step === 'dialog' && history) {
        // FIX: Correctly map chat history to include both text and images, ensuring the model has full context.
        const chatHistory = history.map(msg => {
            const parts: any[] = [];
            if (msg.text !== null && typeof msg.text !== 'undefined') {
                parts.push({ text: msg.text });
            }
            if (msg.imageUrl) {
                const mimeType = msg.imageUrl.substring(msg.imageUrl.indexOf(':') + 1, msg.imageUrl.indexOf(';'));
                const data = msg.imageUrl.substring(msg.imageUrl.indexOf(',') + 1);
                parts.push({
                    inlineData: { mimeType, data }
                });
            }

            // The model requires at least one part.
            if (parts.length === 0) {
                parts.push({ text: '' });
            }
            
            return {
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: parts
            };
        });

        const lastUserMessage = history[history.length - 1];
        const currentUserContent: any = { role: 'user', parts: [] };

        if (lastUserMessage.text) {
             currentUserContent.parts.push({ text: lastUserMessage.text });
        }
       
        if (imageBase64) {
            currentUserContent.parts.push({
                inlineData: {
                    mimeType: imageBase64.split(';')[0].split(':')[1],
                    data: imageBase64.split(',')[1],
                }
            });
            currentUserContent.parts[0].text = currentUserContent.parts[0].text 
                ? `${currentUserContent.parts[0].text} (Посмотри на это изображение и учти его в ответе)`
                : 'Посмотри на это изображение и учти его в ответе. Если это книга, скажи мне, что ты о ней думаешь. Если это книжная полка, проанализируй вкусы владельца.';
        }
        
        return {
            model: textModel,
            // @ts-ignore
            history: chatHistory.slice(0, -1),
            contents: currentUserContent,
            config: { systemInstruction }
        };
    }

    // New logic for conversational questionnaire
    if (step !== 'consult' && step !== 'dialog' && history && history.length > 0) {
        const formattedHistory = history.map(m => `${m.sender === 'user' ? 'Пользователь' : 'Сомелье'}: ${m.text}`).join('\n');
        const promptText = `Это история нашего диалога:\n---\n${formattedHistory}\n---\n
Твоя задача — проанализировать диалог и решить, что делать дальше.
1. Кратко и эмпатично отреагируй на последний ответ пользователя.
2. Определи, какой ключевой информации для подбора книг еще не хватает (из списка: сюжет, жанры, любимые авторы/книги, особые пожелания).
3. Задай следующий наиболее логичный вопрос, чтобы получить недостающую информацию.
4. Если ты считаешь, что информации о настроении, сюжете и жанрах уже достаточно, чтобы дать хорошую рекомендацию, то вместо следующего вопроса ВЕРНИ ТОЛЬКО КОМАНДУ: [PROCEED_TO_CONSULTATION]`;
        
        return {
            model: textModel,
            contents: promptText,
            config: { systemInstruction }
        };
    }
    
    // Fallback for any other case
    return { model: textModel, contents: '', config: { systemInstruction } };
};


export const getSommelierResponse = async (step: Step, answers: UserAnswers, history?: ChatMessage[], imageBase64?: string | null): Promise<string> => {
    const promptConfig = constructPrompt(step, answers, history, imageBase64);
    
    // For dialog step, use chat history
    if (step === 'dialog' && history) {
        const chat = ai.chats.create({
            model: promptConfig.model,
            // @ts-ignore
            history: promptConfig.history,
            config: promptConfig.config
        });
        // FIX: Aligned with the recommended API usage by passing a `{ message: ... }` object.
        const response = await chat.sendMessage({ message: promptConfig.contents.parts });
        return response.text || "Не удалось получить ответ.";
    }

    // For ALL other steps (init, q1-q4, consult), use a direct generateContent call.
    if (!promptConfig.contents) {
        return "Произошла внутренняя ошибка в логике чата.";
    }
    
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: promptConfig.model,
        contents: promptConfig.contents,
        config: promptConfig.config,
    });
    return response.text || "Не удалось получить ответ.";
};


export const generateImage = async (prompt: string): Promise<string | null> => {
    try {
        const response = await ai.models.generateContent({
            model: imageModel,
            contents: { parts: [{ text: `Создай атмосферное, кинематографичное изображение: ${prompt}` }] },
            config: { imageConfig: { aspectRatio: "16:9" } }
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return part.inlineData.data;
            }
        }
        return null;
    } catch (error) {
        console.error("Image generation failed:", error);
        return null;
    }
};

export const generateSpeech = async (text: string): Promise<string | null> => {
    try {
        const response = await ai.models.generateContent({
            model: ttsModel,
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' }, // Warm female voice
                    },
                },
            },
        });
        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;
    } catch (error) {
        console.error("TTS generation failed:", error);
        return null;
    }
};

interface LiveCallbacks {
    onMessage: (message: LiveServerMessage) => void;
    onError: (error: ErrorEvent) => void;
    onClose: () => void;
}

export const connectToLive = async (callbacks: LiveCallbacks) => {
    return ai.live.connect({
        model: liveModel,
        callbacks: {
            onopen: () => console.debug('Live session opened.'),
            onmessage: callbacks.onMessage,
            onerror: callbacks.onError,
            onclose: callbacks.onClose,
        },
        config: {
            inputAudioTranscription: {},
        },
    });
};
