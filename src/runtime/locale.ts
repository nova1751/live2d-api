import type { WidgetLocale } from '../library/catalog';

let language: WidgetLocale = 'zh-CN';
export function setLanguage(locale?: WidgetLocale) { language = locale ?? 'zh-CN'; }
export function translated(zh: string, en: string) { return language === 'en' ? en : zh; }
