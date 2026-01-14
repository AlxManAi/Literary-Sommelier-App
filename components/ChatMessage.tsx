
import React from 'react';
import { ChatMessage as ChatMessageType } from '../types.js';
import { UserIcon, SommelierIcon, LinkIcon, CopyIcon } from './icons.js';

interface ChatMessageProps {
    message: ChatMessageType;
    onPlayAudio: (base64: string) => void;
    onFindLink: (title: string, author: string) => void;
    onCopyText: (text: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onFindLink, onCopyText }) => {
    const isBot = message.sender === 'bot';
    
    const messageClasses = isBot
        ? 'bg-gray-800/60 rounded-r-xl rounded-bl-xl'
        : 'bg-amber-800/50 rounded-l-xl rounded-br-xl ml-auto';

    const icon = isBot ? <SommelierIcon className="w-8 h-8 text-amber-300" /> : <UserIcon className="w-8 h-8 text-amber-200" />;
    
    // Check if the message contains recommendations
    const isRecommendationBlock = message.text?.includes('###');
    const recommendations = isRecommendationBlock ? message.text!.split('---').filter(rec => rec.trim()) : [];

    const renderContent = () => {
        if (!isRecommendationBlock || !isBot) {
            return (
                <>
                    {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
                    {message.imageUrl && (
                        <img src={message.imageUrl} alt="Generated content" className="mt-2 rounded-lg max-w-full h-auto" />
                    )}
                </>
            );
        }

        return (
            <div className="space-y-4">
                {recommendations.map((recText, index) => {
                    const match = recText.trim().match(/###\s*(.*?) \((.*?)\)/);
                    const title = match ? match[1] : 'Книга';
                    const author = match ? match[2] : 'Автор';
                    const cleanRecText = recText.trim();
                    const hasImage = index === 0 && message.imageUrl;

                    return (
                        <div key={index} className="pt-2">
                            <p className="whitespace-pre-wrap">{cleanRecText}</p>
                            {hasImage && (
                                <img src={message.imageUrl} alt={`Атмосфера для ${title}`} className="mt-2 rounded-lg max-w-full h-auto" />
                            )}
                            <div className="flex items-center space-x-2 mt-3">
                                <button 
                                    onClick={() => onFindLink(title, author)}
                                    className="flex items-center space-x-1.5 text-xs px-2.5 py-1.5 bg-gray-700 hover:bg-amber-700 rounded-full transition-colors"
                                >
                                    <LinkIcon className="w-4 h-4" />
                                    <span>Найти онлайн</span>
                                </button>
                                <button 
                                    onClick={() => onCopyText(cleanRecText)}
                                    className="flex items-center space-x-1.5 text-xs px-2.5 py-1.5 bg-gray-700 hover:bg-amber-700 rounded-full transition-colors"
                                >
                                    <CopyIcon className="w-4 h-4" />
                                    <span>Копировать</span>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className={`flex items-start gap-3 max-w-xl ${isBot ? '' : 'flex-row-reverse'}`}>
            <div className="flex-shrink-0 p-1 rounded-full bg-gray-700">{icon}</div>
            <div className={`px-4 py-3 text-white ${messageClasses} max-w-full break-words w-full`}>
                {renderContent()}
            </div>
        </div>
    );
};
