const { BetaAnalyticsDataClient } = require('@google-analytics/data');

const propertyId = '546423391'; // Extracted from your URL!

// Initialize client using the JSON we saved
const analyticsDataClient = new BetaAnalyticsDataClient({
  keyFilename: '.ga4-credentials.json',
});

async function runReport() {
  try {
    const [response] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate: '7daysAgo',
          endDate: 'today',
        },
      ],
      metrics: [
        {
          name: 'activeUsers',
        },
        {
          name: 'screenPageViews'
        }
      ],
    });

    console.log('Report result:');
    response.rows.forEach(row => {
      console.log(row.metricValues[0].value, 'active users');
      console.log(row.metricValues[1].value, 'page views');
    });
    console.log("Successfully connected to Google Analytics!");
  } catch (error) {
    console.error("Error connecting to GA4:", error.message);
  }
}

runReport();
