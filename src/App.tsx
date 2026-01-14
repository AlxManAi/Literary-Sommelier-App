

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage as ChatMessageType, Step, UserAnswers, BotMessage } from './types.js';
import { getSommelierResponse, generateImage, generateSpeech, connectToLive } from './services/geminiService.js';
import { ChatMessage } from './components/ChatMessage.js';
import { ChatInput } from './components/ChatInput.js';
import { ResetIcon, SommelierIcon } from './components/icons.js';
import { decode, decodeAudioData, encode } from './utils/audio.js';

const App: React.FC = () => {
    const [step, setStep] = useState<Step>('init');
    const [userAnswers, setUserAnswers] = useState<UserAnswers>({});
    const [chatHistory, setChatHistory] = useState<ChatMessageType[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    
    const audioContextRef = useRef<AudioContext | null>(null);
    const liveSessionRef = useRef<any>(null); // Using any for the live session object
    const microphoneStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

    const initialMessage: BotMessage = {
        id: Date.now(),
        sender: 'bot',
        text: 'Привет! Я Литературный Сомелье. Подберу идеальную книгу по твоему настроению. Какое у тебя сейчас настроение? (например: грусть, энергия, романтика, мистика)',
        audioUrl: null,
        imageUrl: null,
    };

    const playAudio = useCallback(async (base64Audio: string) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const audioContext = audioContextRef.current;
        await audioContext.resume();
        const decodedData = decode(base64Audio);
        const audioBuffer = await decodeAudioData(decodedData, audioContext, 24000, 1);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
    }, []);

    const addBotMessage = useCallback(async (text: string, imageUrl: string | null = null) => {
        const botMessage: BotMessage = {
            id: Date.now(),
            sender: 'bot',
            text,
            audioUrl: null,
            imageUrl
        };
        setChatHistory(prev => [...prev, botMessage]);

        try {
            const audioData = await generateSpeech(text);
            if (audioData) {
                setChatHistory(prev => prev.map(msg => msg.id === botMessage.id ? { ...msg, audioUrl: audioData } : msg));
                await playAudio(audioData);
            }
        } catch (error) {
            console.error("Error generating or playing speech:", error);
        }
    }, [playAudio]);


    const stopRecording = useCallback(() => {
        if (liveSessionRef.current) {
            liveSessionRef.current.close();
            liveSessionRef.current = null;
        }
        if (microphoneStreamRef.current) {
            microphoneStreamRef.current.getTracks().forEach(track => track.stop());
            microphoneStreamRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        setIsRecording(false);
        console.debug("Recording stopped and resources released.");
    }, []);

    const handleReset = useCallback(() => {
        setStep('init');
        setUserAnswers({});
        setChatHistory([initialMessage]);
        setIsLoading(false);
        if (isRecording) {
            stopRecording();
        }
    }, [initialMessage, isRecording, stopRecording]);

    useEffect(() => {
        handleReset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const processRecommendations = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await getSommelierResponse('consult', userAnswers, chatHistory);
            const imagePromptMatch = response.match(/\[описание по настроению: (.*?)\]/);
            const cleanResponse = response.replace(/\[описание по настроению: (.*?)\]/, '').trim();

            await addBotMessage(cleanResponse);

            if (imagePromptMatch && imagePromptMatch[1]) {
                const imagePrompt = imagePromptMatch[1];
                const imageData = await generateImage(imagePrompt);
                if (imageData) {
                     const imageMessage: ChatMessageType = {
                        id: Date.now() + 1,
                        sender: 'bot',
                        text: null,
                        imageUrl: `data:image/png;base64,${imageData}`
                    };
                    setChatHistory(prev => [...prev, imageMessage]);
                }
            }
            setStep('dialog');
        } catch (error) {
            console.error("Error during consultation:", error);
            await addBotMessage("Произошла ошибка при подборе рекомендаций. Попробуйте еще раз.");
        } finally {
            setIsLoading(false);
        }
    }, [addBotMessage, userAnswers, chatHistory]);


    const handleUserInput = useCallback(async (input: string, imageBase64: string | null = null) => {
        if (!input.trim() && !imageBase64) return;
        
        const userMessage: ChatMessageType = {
            id: Date.now(),
            sender: 'user',
            text: input,
            imageUrl: imageBase64 ? `data:${imageBase64.split(';')[0].split(':')[1]};base64,${imageBase64.split(',')[1]}` : null,
        };
        const newChatHistory = [...chatHistory, userMessage];
        setChatHistory(newChatHistory);
        setIsLoading(true);

        try {
            if (step !== 'dialog' && step !== 'consult') {
                const newAnswers = { ...userAnswers };
                const answerKeyMap: Record<Step, keyof UserAnswers | null> = { 'init': 'mood', 'q1': 'plot', 'q2': 'genres', 'q3': 'favorites', 'q4': 'other', 'consult': null, 'dialog': null };
                
                const answerKey = answerKeyMap[step];
                if (answerKey) {
                    (newAnswers as any)[answerKey] = input;
                }
                setUserAnswers(newAnswers);
                
                const aiResponse = await getSommelierResponse(step, newAnswers, newChatHistory, imageBase64);

                if (aiResponse.includes('[PROCEED_TO_CONSULTATION]')) {
                    setStep('consult');
                } else {
                    await addBotMessage(aiResponse);
                    // FIX: Completed the map to satisfy the Record<Step, Step> type, preventing a TypeScript error.
                    const nextStepMap: Record<Step, Step> = { 'init': 'q1', 'q1': 'q2', 'q2': 'q3', 'q3': 'q4', 'q4': 'consult', 'consult': 'dialog', 'dialog': 'dialog' };
                    setStep(nextStepMap[step]);
                }

            } else {
                 const response = await getSommelierResponse(step, userAnswers, newChatHistory, imageBase64);
                 await addBotMessage(response);
            }
        } catch (error) {
            console.error("Error processing user input:", error);
            await addBotMessage("Извините, произошла ошибка. Давайте попробуем снова.");
        } finally {
            setIsLoading(false);
        }
    }, [step, userAnswers, addBotMessage, chatHistory]);

    useEffect(() => {
        if (step === 'consult') {
            processRecommendations();
        }
    }, [step, processRecommendations]);
    
    const startRecording = useCallback(async () => {
        if (isRecording) {
            stopRecording();
            return;
        }
        
        setIsRecording(true);
        let transcribedText = '';

        try {
            const sessionPromise = connectToLive({
                onMessage: (message) => {
                     if (message.serverContent?.inputTranscription) {
                        transcribedText += message.serverContent.inputTranscription.text;
                    }
                    if (message.serverContent?.turnComplete) {
                        const finalText = transcribedText.trim();
                        if (finalText) {
                            handleUserInput(finalText);
                        }
                        transcribedText = '';
                        stopRecording();
                    }
                },
                onError: (error) => {
                    console.error("Live session error:", error);
                    addBotMessage("Произошла ошибка с распознаванием голоса.");
                    stopRecording();
                },
                onClose: () => {
                    console.debug("Live session closed.");
                    stopRecording();
                }
            });

            liveSessionRef.current = await sessionPromise;
            
            microphoneStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const source = audioContext.createMediaStreamSource(microphoneStreamRef.current);
            scriptProcessorRef.current = audioContext.createScriptProcessor(4096, 1, 1);

            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const l = inputData.length;
                const int16 = new Int16Array(l);
                for (let i = 0; i < l; i++) {
                    int16[i] = inputData[i] * 32768;
                }
                const base64 = encode(new Uint8Array(int16.buffer));

                sessionPromise.then((session) => {
                    session.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
                });
            };
            
            source.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(audioContext.destination);

        } catch (error) {
            console.error("Failed to start recording:", error);
            addBotMessage("Не удалось получить доступ к микрофону.");
            stopRecording();
        }
    }, [isRecording, stopRecording, handleUserInput, addBotMessage]);


    return (
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white h-screen w-screen flex flex-col font-sans">
            <header className="flex items-center justify-between p-4 border-b border-gray-700 shadow-lg">
                <div className="flex items-center space-x-3">
                    <SommelierIcon className="w-10 h-10 text-amber-300"/>
                    <div>
                        <h1 className="text-xl font-bold tracking-wider text-amber-200">Литературный Сомелье</h1>
                        <p className="text-sm text-gray-400">Ваш персональный книжный гид</p>
                    </div>
                </div>
                <button
                    onClick={handleReset}
                    className="p-2 rounded-full hover:bg-gray-700 transition-colors duration-200"
                    aria-label="Начать диалог с начала"
                >
                    <ResetIcon className="w-6 h-6 text-gray-400 hover:text-white"/>
                </button>
            </header>
            
            <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                {chatHistory.map((msg) => (
                    <ChatMessage key={msg.id} message={msg} onPlayAudio={playAudio} />
                ))}
                {isLoading && (
                    <div className="flex justify-center">
                         <div className="flex items-center space-x-2 text-gray-400">
                             <div className="w-2 h-2 bg-amber-300 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                             <div className="w-2 h-2 bg-amber-300 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                             <div className="w-2 h-2 bg-amber-300 rounded-full animate-pulse"></div>
                             <span>Подбираю...</span>
                         </div>
                    </div>
                )}
                 <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
            </main>

            <footer className="p-4 bg-gray-900/50 backdrop-blur-sm border-t border-gray-700">
                <ChatInput 
                    onSend={handleUserInput} 
                    isLoading={isLoading}
                    isRecording={isRecording}
                    onRecord={startRecording}
                />
            </footer>
        </div>
    );
};

export default App;
