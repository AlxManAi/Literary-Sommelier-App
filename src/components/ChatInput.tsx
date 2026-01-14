
import React, { useState, useRef } from 'react';
import { SendIcon, MicrophoneIcon, ImageIcon, StopIcon } from './icons.js';

interface ChatInputProps {
    onSend: (text: string, imageBase64: string | null) => void;
    isLoading: boolean;
    isRecording: boolean;
    onRecord: () => void;
}

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, isLoading, isRecording, onRecord }) => {
    const [text, setText] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSend = () => {
        if (text.trim() && !isLoading) {
            onSend(text, null);
            setText('');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > MAX_IMAGE_SIZE_BYTES) {
                alert(`Файл слишком большой. Пожалуйста, выберите изображение размером до ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024} МБ.`);
                // Reset file input
                if(fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                onSend(text, reader.result as string);
                setText('');
                 if(fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="flex items-center space-x-2 md:space-x-4">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isRecording}
                className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors"
                aria-label="Upload image"
            >
                <ImageIcon className="w-6 h-6 text-gray-300" />
            </button>
            <div className="flex-1 relative">
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Спросите что-нибудь о книгах..."
                    className="w-full h-12 p-3 pr-28 bg-gray-800 border border-gray-600 rounded-full text-white resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                    rows={1}
                    disabled={isLoading || isRecording}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                     <button
                        onClick={onRecord}
                        disabled={isLoading}
                        className={`p-3 rounded-full transition-colors ${isRecording ? 'bg-red-600 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'}`}
                        aria-label={isRecording ? "Stop recording" : "Start recording"}
                    >
                        {isRecording ? <StopIcon className="w-6 h-6 text-white"/> : <MicrophoneIcon className="w-6 h-6 text-gray-300" />}
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={isLoading || isRecording || !text.trim()}
                        className="p-3 rounded-full bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 disabled:opacity-50 transition-colors"
                        aria-label="Send message"
                    >
                        <SendIcon className="w-6 h-6 text-white" />
                    </button>
                </div>
            </div>
        </div>
    );
};
