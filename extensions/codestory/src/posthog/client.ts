import { PostHog } from 'posthog-node';

const postHogClient = new PostHog(
    'phc_dKVAmUNwlfHYSIAH1kgnvq3iEw7ovE5YYvGhTyeRlaB',
    { host: 'https://app.posthog.com' }
);

export default postHogClient;
