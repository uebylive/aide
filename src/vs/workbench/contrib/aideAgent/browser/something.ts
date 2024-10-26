interface GreetingOptions {
	name: string;
	language?: 'en' | 'es' | 'fr';
}

function translateGreeting(greeting: string, language: string): string {
	const translations: Record<string, Record<string, string>> = {
		'Good morning': { en: 'Good morning', es: 'Buenos días', fr: 'Bonjour' },
		'Good afternoon': { en: 'Good afternoon', es: 'Buenas tardes', fr: 'Bon après-midi' },
		'Good evening': { en: 'Good evening', es: 'Buenas noches', fr: 'Bonsoir' }
	};
	return translations[greeting]?.[language] || greeting;
}

function getTimeBasedGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}

function hello(options: GreetingOptions): string {
	const { name = 'World', language = 'en' } = options;
	const greeting = getTimeBasedGreeting();
	const translatedGreeting = translateGreeting(greeting, language);
	return `${translatedGreeting}, ${name}!`;
}
