import React, { createContext, useState, useContext, useEffect } from 'react';
import { translations } from './locales';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
    const [lang, setLang] = useState(localStorage.getItem('app-lang') || 'fi');

    useEffect(() => {
        localStorage.setItem('app-lang', lang);
    }, [lang]);

    const t = translations[lang];

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

// Custom hook, jolla kieltä käytetään muissa komponenteissa
export const useLanguage = () => {
  const context = useContext(LanguageContext);
  
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  
  return context;
};