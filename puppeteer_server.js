const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Environment variables
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY || '08edc78925c0c8f893dc1ec88e4611a4';

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'Puppeteer Server Running',
        timestamp: new Date().toISOString()
    });
});

// Main scraping endpoint
app.post('/render', async (req, res) => {
    const { url, waitFor = 2000, useScraperAPI = false } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    try {
        let html;
        
        if (useScraperAPI) {
            // Fallback to ScraperAPI
            html = await scrapeWithScraperAPI(url);
        } else {
            // Primary: Use Puppeteer
            html = await scrapeWithPuppeteer(url, waitFor);
        }
        
        res.json({
            success: true,
            url: url,
            html: html,
            method: useScraperAPI ? 'ScraperAPI' : 'Puppeteer',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Scraping error:', error.message);
        
        // Auto-fallback to ScraperAPI if Puppeteer fails
        if (!useScraperAPI) {
            try {
                console.log('Puppeteer failed, falling back to ScraperAPI...');
                const html = await scrapeWithScraperAPI(url);
                
                return res.json({
                    success: true,
                    url: url,
                    html: html,
                    method: 'ScraperAPI (fallback)',
                    warning: 'Puppeteer failed, used fallback',
                    timestamp: new Date().toISOString()
                });
                
            } catch (fallbackError) {
                return res.status(500).json({
                    error: 'Both Puppeteer and ScraperAPI failed',
                    puppeteerError: error.message,
                    scraperApiError: fallbackError.message
                });
            }
        }
        
        res.status(500).json({
            error: 'Scraping failed',
            message: error.message
        });
    }
});

// Puppeteer scraping function
async function scrapeWithPuppeteer(url, waitFor) {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--memory-pressure-off',
            '--max_old_space_size=4096'
        ],
        timeout: 60000
    });
    
    const page = await browser.newPage();
    
    try {
        // Set viewport and user agent
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Navigate with optimized settings
        await page.goto(url, { 
            waitUntil: 'domcontentloaded', 
            timeout: 45000 
        });
        
        // Wait for dynamic content
        await page.waitForTimeout(waitFor);
        
        const html = await page.content();
        return html;
        
    } finally {
        await page.close();
        await browser.close();
    }
}

// ScraperAPI fallback function
async function scrapeWithScraperAPI(url) {
    const scraperUrl = `http://api.scraperapi.com?api_key=${SCRAPERAPI_KEY}&url=${encodeURIComponent(url)}`;
    
    const response = await axios.get(scraperUrl, {
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    
    return response.data;
}

// GET endpoint for simple URL scraping
app.get('/scrape', async (req, res) => {
    const { url, waitFor = 2000, useScraperAPI = false } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    try {
        let html;
        
        if (useScraperAPI === 'true') {
            html = await scrapeWithScraperAPI(url);
        } else {
            html = await scrapeWithPuppeteer(url, parseInt(waitFor));
        }
        
        res.json({
            success: true,
            url: url,
            html: html,
            method: useScraperAPI === 'true' ? 'ScraperAPI' : 'Puppeteer',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('GET scraping error:', error.message);
        res.status(500).json({
            error: 'Scraping failed',
            message: error.message
        });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Puppeteer Server running on port ${PORT}`);
    console.log(`📡 Health check available at /`);
    console.log(`🔍 Scrape endpoint: POST /render`);
    console.log(`🌐 Server bound to 0.0.0.0:${PORT}`);
});

module.exports = app;
