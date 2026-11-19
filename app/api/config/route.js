import { route, json } from '@/lib/http';
import { getPetSeconds } from '@/lib/settings';

// Public UI config: how long a petted animal stays happy (seconds). Nothing secret here.
export const GET = route(async () => json({ petSeconds: await getPetSeconds() }));
