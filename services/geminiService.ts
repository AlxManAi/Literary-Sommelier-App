
import { GoogleGenAI, GenerateContentResponse, LiveServerMessage, Modality } from '@google/genai';
import { Step, ChatMessage } from '../types.js';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const textModel = 'gemini-3-flash-preview';
const imageModel = 'gemini-2.5-flash-image';
const ttsModel = 'gemini-2.5-flash-preview-tts';
const liveModel = 'gemini-2.5-flash-native-audio-preview-12-2025';

const constructPrompt = (step: Step, history?: ChatMessage[], imageBase64?: string | null): any => {
    const systemInstruction = `Ты — "Литературный Сомелье", эмпатичный и вдохновляющий эксперт по подбору книг. Твои ответы должны быть лаконичными (до 150 слов). Веди диалог от женского лица (например, "я подобрала", "ваш сомелье").
    
    Workflow:
    - init: Приветствие и сбор информации (настроение, сюжет, жанр и т.д.).
    - consult: Предоставление 3 рекомендаций на основе собранной информации.
    - dialog: Обсуждение рекомендаций, ответы на вопросы.
    
    Current Step: ${step}
    `;

    const formattedHistory = history?.map(m => {
        const role = m.sender === 'user' ? 'Пользователь' : 'Сомелье';
        return `${role}: ${m.text || '[изображение]'}`;
    }).join('\n');

    if (step === 'consult' && history) {
        return {
            model: textModel,
            contents: `Проанализируй весь предыдущий диалог, чтобы понять предпочтения пользователя:\n---\n${formattedHistory}\n---\n
Теперь, основываясь на всей собранной информации, дай 3 рекомендации книг. Раздели каждую рекомендацию тремя дефисами (---).
Для каждой рекомендации используй СТРОГИЙ формат:
1. Начни с '###' и укажи Название книги, а затем в скобках (Автор).
2. Кратко объясни, почему она подходит, связывая с ответами из диалога.
3. Добавь интригующий тизер (1-2 предложения).
Для ПЕРВОЙ книги в списке, добавь в конце описания специальный тег для генерации изображения, который описывает атмосферу книги. Формат: "[описание по настроению: твой текст описания]".`,
            config: { systemInstruction }
        };
    }
    
    if (step === 'dialog' && history) {
        const chatHistory = history.map(msg => {
            const parts: any[] = [];
            if (msg.text) parts.push({ text: msg.text });
            if (msg.imageUrl) {
                 parts.push({
                    inlineData: {
                        mimeType: msg.imageUrl.split(';')[0].split(':')[1],
                        data: msg.imageUrl.split(',')[1],
                    }
                });
            }
            return {
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: parts
            };
        });

        const lastUserMessage = history[history.length - 1];
        const currentUserContent: any = { role: 'user', parts: [] };
        if (lastUserMessage.text) currentUserContent.parts.push({ text: lastUserMessage.text });
        if (imageBase64) {
            currentUserContent.parts.push({
                inlineData: {
                    mimeType: imageBase64.split(';')[0].split(':')[1],
                    data: imageBase64.split(',')[1],
                }
            });
        }
        
        return {
            model: textModel,
            history: chatHistory.slice(0, -1),
            contents: currentUserContent.parts,
            config: { systemInstruction }
        };
    }

    if (step === 'init' && history) {
        const promptText = `Это история нашего диалога:\n---\n${formattedHistory}\n---\n
Твоя задача — проанализировать диалог и решить, что делать дальше.
1. Кратко и эмпатично отреагируй на последний ответ пользователя.
2. Определи, какой ключевой информации для подбора книг еще не хватает (из списка: сюжет, жанры, любимые авторы/книги).
3. Задай следующий наиболее логичный вопрос, чтобы получить недостающую информацию.
4. Если ты считаешь, что информации о настроении, сюжете и жанрах уже достаточно, чтобы дать хорошую рекомендацию, то вместо следующего вопроса ВЕРНИ ТОЛЬКО КОМАНДУ: [PROCEED_TO_CONSULTATION]`;
        
        return {
            model: textModel,
            contents: promptText,
            config: { 
                systemInstruction,
                thinkingConfig: { thinkingBudget: 0 } // Ускоряем ответы на простых шагах
            }
        };
    }
    
    // Fallback
    return { model: textModel, contents: 'Привет!', config: { systemInstruction } };
};

export const getSommelierResponse = async (step: Step, history?: ChatMessage[], imageBase64?: string | null): Promise<string> => {
    const promptConfig = constructPrompt(step, history, imageBase64);
    
    if (step === 'dialog' && history) {
        const chat = ai.chats.create({
            model: promptConfig.model,
            history: promptConfig.history,
            config: promptConfig.config
        });
        const response = await chat.sendMessage({ message: promptConfig.contents });
        return response.text || "Не удалось получить ответ.";
    }

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

export const findBookLink = async (title: string, author: string): Promise<string> => {
    try {
        const prompt = `Найди самую подходящую веб-ссылку на книгу "${title}" (${author}) на популярном ресурсе (Goodreads, Litres, Amazon и т.п.). Верни ответ только в формате Markdown: [${title}]({ссылка}). Если не можешь найти, напиши "К сожалению, не удалось найти ссылку."`;
        const response = await ai.models.generateContent({
            model: textModel,
            contents: prompt,
            config: { temperature: 0 }
        });
        return response.text || "К сожалению, не удалось найти ссылку.";
    } catch (error) {
        console.error("Book link search failed:", error);
        return "Произошла ошибка при поиске ссылки.";
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
