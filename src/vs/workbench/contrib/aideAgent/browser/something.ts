interface TimeRange {
	start: number;
	end: number;
	greeting: string;
}

function hello(
	name: string,
	greeting?: string,
	punctuation: string | string[] = '!',
	capitalize: boolean = false,
	customTimeRanges?: TimeRange[]
) {
	if (!greeting) {
		const hour = new Date().getHours();
		const defaultRanges: TimeRange[] = [
			{ start: 22, end: 5, greeting: 'Good night' },
			{ start: 5, end: 12, greeting: 'Good morning' },
			{ start: 12, end: 18, greeting: 'Good afternoon' },
			{ start: 18, end: 22, greeting: 'Good evening' }
		];

		const ranges = customTimeRanges || defaultRanges;
		greeting = ranges.find(range =>
			range.start <= range.end
				? (hour >= range.start && hour < range.end)
				: (hour >= range.start || hour < range.end)
		)?.greeting || 'Hello';
	}

	const finalPunctuation = Array.isArray(punctuation) ? punctuation.join('') : punctuation;
	const formattedName = capitalize ? name.toUpperCase() : name;
	return `${greeting}, ${formattedName}${finalPunctuation}`;
}
