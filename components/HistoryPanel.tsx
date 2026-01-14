
import React from 'react';
import { Recommendation } from '../types.js';
import { XMarkIcon, SommelierIcon } from './icons.js';

interface HistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    recommendations: Recommendation[];
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, onClose, recommendations }) => {
    return (
        <div 
            className={`fixed inset-0 z-50 transition-opacity duration-300 ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
            <div 
                className={`fixed top-0 right-0 h-full w-full max-w-md bg-gray-900 shadow-2xl transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking on the panel
            >
                <div className="flex flex-col h-full">
                    <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                        <div className="flex items-center space-x-3">
                            <SommelierIcon className="w-8 h-8 text-amber-300"/>
                            <h2 className="text-lg font-semibold text-amber-200">История рекомендаций</h2>
                        </div>
                        <button 
                            onClick={onClose} 
                            className="p-2 rounded-full hover:bg-gray-700"
                            aria-label="Закрыть историю"
                        >
                            <XMarkIcon className="w-6 h-6 text-gray-400" />
                        </button>
                    </header>
                    <div className="flex-1 overflow-y-auto p-4">
                        {recommendations.length > 0 ? (
                            <ul className="space-y-3">
                                {recommendations.map((rec, index) => (
                                    <li key={index} className="p-3 bg-gray-800 rounded-lg">
                                        <p className="font-bold text-white">{rec.title}</p>
                                        <p className="text-sm text-gray-400">{rec.author}</p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="flex items-center justify-center h-full text-center text-gray-500">
                                <p>Здесь будет отображаться история<br/>ваших книжных находок.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
