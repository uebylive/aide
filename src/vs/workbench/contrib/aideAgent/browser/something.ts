function something() {
}
 * @param name - The name of the person to greet
 * @param language - The language code for the greeting (en, es, fr)
 * @returns string - The formatted greeting message
 * @throws Error if the language is not supported
 */
function hello(name: string, language: string = 'en'): string {
	// Step 1: Get current time
	const currentTime = new Date();
	const hour = currentTime.getHours();

	// Step 2: Create personalized greeting based on time of day and language
	const greetings: Record<string, [string, string, string]> = {
		en: ['Good morning', 'Good afternoon', 'Good evening'],
		es: ['Buenos días', 'Buenas tardes', 'Buenas noches'],
		fr: ['Bonjour', 'Bon après-midi', 'Bonsoir']
	};

	if (!greetings[language]) {
		throw new Error(`Unsupported language: ${language}. Supported languages are: ${Object.keys(greetings).join(', ')}`);
	}

	const [morning, afternoon, evening] = greetings[language];
	let greeting = hour < 12 ? morning : hour < 18 ? afternoon : evening;

	// Step 3: Create and return the complete greeting message
	const message = `${greeting}, ${name}! Welcome to our application.`;
	console.log(message);
	return message;
}




