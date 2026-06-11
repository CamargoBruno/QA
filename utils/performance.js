export async function getPerformanceMetrics(page) {
    const metrics = await page.evaluate(() => {

        const navigation = performance.getEntriesByType("navigation")[0];
        const paint = performance.getEntriesByType("paint");

        const fcpEntry = paint.find(p => p.name === "first-contentful-paint");

        return {
            ttfb: navigation.responseStart - navigation.requestStart,
            dns: navigation.domainLookupEnd - navigation.domainLookupStart,
            tcp: navigation.connectEnd - navigation.connectStart,
            domContentLoaded: navigation.domContentLoadedEventEnd - navigation.startTime,
            loadComplete: navigation.loadEventEnd - navigation.startTime,
            fcp: fcpEntry ? fcpEntry.startTime : null
        };
    });
    return metrics;
}