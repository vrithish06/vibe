import axios from 'axios';

export class TimeUtils {
    /**
     * Fetches the true IST time from an external reliable source.
     * Fallbacks to the local server time if the external API fails.
     */
    public static async getTrueTime(): Promise<Date> {
        try {
            const res = await axios.get('https://timeapi.io/api/Time/current/zone?timeZone=Asia/Kolkata', { timeout: 3000 });
            if (res.data && res.data.dateTime) {
                return new Date(res.data.dateTime);
            }
        } catch (error) {
            console.warn('[TimeUtils] Failed to fetch true time from external API, falling back to local time.', error?.message || error);
        }
        return new Date();
    }
}
