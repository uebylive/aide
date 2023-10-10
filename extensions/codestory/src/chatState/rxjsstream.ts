/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Readable } from 'stream';
import { Observable } from 'rxjs';
import { EventSource } from 'eventsource';

function fromObservable<T>(observable: Observable<T>): Readable {
	const stream = new Readable({
		objectMode: true, // To push objects instead of buffers or strings
		read() { } // Implementation not required; we push manually
	});

	const subscription = observable.subscribe(
		value => stream.push(value),
		err => {
			console.error(err);
			stream.destroy(err);
		},
		() => stream.push(null) // Signals end of data
	);

	stream.on('close', () => subscription.unsubscribe());

	return stream;
}

function createEventSourceStream(url: string): Observable<any> {
	return new Observable<any>((observer) => {
		const eventSource = new EventSource(url);

		eventSource.onmessage = (event: { data: any }) => {
			observer.next({
				data: event.data
			});
		};

		eventSource.onerror = (error: any) => {
			observer.error(error);
		};

		return () => {
			eventSource.close();
		};
	});
}

export class Deferred<T> {
	resolve: (value: T | PromiseLike<T>) => void = null!;
	reject: (reason?: any) => void = null!;
	promise = new Promise<T>((a, b) => {
		this.resolve = a;
		this.reject = b;
	});
}

export async function* eachValueFrom<T>(
	source: Observable<T>
): AsyncIterableIterator<T> {
	const deferreds: Deferred<IteratorResult<T>>[] = [];
	const values: T[] = [];
	let hasError = false;
	let error: any = null;
	let completed = false;

	const subs = source.subscribe({
		next: value => {
			if (deferreds.length > 0) {
				deferreds.shift()!.resolve({ value, done: false });
			} else {
				values.push(value);
			}
		},
		error: err => {
			hasError = true;
			error = err;
			while (deferreds.length > 0) {
				deferreds.shift()!.reject(err);
			}
		},
		complete: () => {
			completed = true;
			while (deferreds.length > 0) {
				deferreds.shift()!.resolve({ value: undefined, done: true });
			}
		},
	});

	try {
		while (true) {
			if (values.length > 0) {
				yield values.shift()!;
			} else if (completed) {
				return;
			} else if (hasError) {
				throw error;
			} else {
				const d = new Deferred<IteratorResult<T>>();
				deferreds.push(d);
				const result = await d.promise;
				if (result.done) {
					return;
				} else {
					yield result.value;
				}
			}
		}
	} catch (err) {
		throw err;
	} finally {
		subs.unsubscribe();
	}
}

// void (async () => {
// 	const url = 'http://127.0.0.1:42424/api/agent/search_agent?reporef=local//Users/skcd/scratch/sidecar&query="How does the agent perform search operations for a query"';
// 	const asyncIterable = eachValueFrom(createEventSourceStream(url));
// 	for await (const value of asyncIterable) {
// 		console.log("we are here");
// 		console.log(value);
// 	}
// })();
