# TheOBlueprint - Website Setup Guide

## Project Structure

```
d:\Jasons Web\
├── index.html              # Main website file
├── css/
│   └── main.css           # All styling (mobile-first responsive)
├── js/
│   └── main.js            # All JavaScript functionality
└── assets/
    ├── images/            # Store your images here
    └── fonts/             # Custom fonts (if needed)
```

## Quick Start

### 1. Run Locally

**Recommended (required for Training / Check-ins / Leaderboard APIs): Run the Node server**
```bash
cd d:\Jasons Web
npm install
npm run dev
# Open browser: http://localhost:3000
```

Note: the options below are **static-only** (good for the landing page). If you use them, any `/api/...` calls will 404 (for example `/api/leaderboard`, `/api/training/checkin`, etc.).

**Option A: Using Python (Simple HTTP Server)**
```bash
cd d:\Jasons Web
python -m http.server 8000
# Open browser: http://localhost:8000
```

**Option B: Using Node.js (http-server)**
```bash
npm install -g http-server
cd d:\Jasons Web
http-server
# Open browser: http://localhost:8080
```

**Option C: Using VS Code Live Server**
- Install "Live Server" extension by Ritwick Dey
- Right-click index.html → "Open with Live Server"

---

## Configuration & Customization

### A) Update Form Endpoints

**File:** `js/main.js` (Lines 14-20)

Replace placeholder endpoints with your actual form services:

```javascript
const FORM_ENDPOINTS = {
    resources: "https://formspree.io/f/YOUR_FORM_ID",  // ← Add your Formspree, Klaviyo, or MailerLite endpoint
    contact: "https://formspree.io/f/YOUR_FORM_ID"     // ← Add your contact form endpoint
};
```

**Steps to get your endpoint:**

**For Formspree (Easiest):**
1. Go to https://formspree.io
2. Sign up & create a new form
3. Copy your form ID (e.g., `f/abc123xyz`)
4. Paste it: `https://formspree.io/f/abc123xyz`

**For MailerLite:**
1. Go to https://mailerlite.com
2. Create a form
3. Use the API endpoint provided in form settings

**For Klaviyo:**
1. Go to https://www.klaviyo.com
2. Set up a signup form
3. Get the form action URL

---

### B) Update Checkout URLs

**File:** `js/main.js` (Lines 22-25)

Replace with your actual checkout/payment links:

```javascript
const CHECKOUT_URLS = {
    training: "https://your-checkout-link.com/training",  // ← Stripe, Gumroad, SendOwl, etc.
    notebook: "https://your-checkout-link.com/notebook"   // ← Your product checkout link
};
```

**Popular options:**
- **Stripe:** https://stripe.com (most flexible)
- **Gumroad:** https://gumroad.com (simple digital products)
- **SendOwl:** https://www.sendowl.com (courses + products)
- **Shopify:** https://www.shopify.com (full e-commerce)

---

### C) Update YouTube Shorts List

**File:** `js/main.js` (Lines 9-34)

Edit the `YOUTUBE_SHORTS_CONFIG` array to add your Shorts:

```javascript
const YOUTUBE_SHORTS_CONFIG = [
    {
        title: "Your Short Title",
        url: "https://www.youtube.com/shorts/YOUR_VIDEO_ID",
        thumbnail: "https://img.youtube.com/vi/YOUR_VIDEO_ID/mqdefault.jpg"
    },
    // Add more shorts here
];
```

**How to get YouTube Shorts data:**
1. Go to your YouTube Short URL: `https://www.youtube.com/shorts/ABC123DEF`
2. Copy the video ID (ABC123DEF)
3. For thumbnail: Replace `YOUR_VIDEO_ID` with your video ID
4. Thumbnail URL format: `https://img.youtube.com/vi/YOUR_VIDEO_ID/mqdefault.jpg`

---

### D) Update Brand Name & Copy

**File:** `index.html`

1. **Navbar brand:** Line 14
   ```html
   <div class="navbar-brand">TheOBlueprint</div>  <!-- Change this -->
   ```

2. **Hero section:** Lines 34-35
   ```html
   <h1 class="hero-title">Discipline. Structure. Results.</h1>
   <p class="hero-subtitle">Your Blueprint for Unstoppable Fitness Progress</p>
   ```

3. **Product names & prices:** Lines 108-146

4. **Footer copy:** Lines 237-240

---

### E) Update Contact Links

**File:** `index.html` (Lines 231-235)

Replace social media placeholders:

```html
<a href="https://youtube.com/@YOUR_HANDLE" target="_blank">YouTube</a>
<a href="https://instagram.com/YOUR_HANDLE" target="_blank">Instagram</a>
```

---

### F) Update Email Form Behavior

**File:** `js/main.js` (Lines 89-105)

Currently shows a simple alert. To actually send emails:

```javascript
// Uncomment this section to use Formspree (replace the alert):
fetch(FORM_ENDPOINTS.resources, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email })
}).then(response => {
    if (response.ok) {
        alert(`Thank you, ${name}! Check your email (${email}) for the free guides.`);
        form.reset();
    }
});
```

---

### G) Update Product Prices

**File:** `index.html` (Lines 118 & 125)

For training program:
```html
<div class="price-option selected" data-price="40" data-billing="month">
    <div class="price-label">Monthly</div>
    <div class="price-amount">$40<span>/mo</span></div>
</div>
```

For notebook:
```html
<div class="price-amount">$29.99</div>  <!-- Change this -->
```

---

## Color Customization

**File:** `css/main.css` (Lines 6-16)

Update the brand color (default: blue):

```css
--accent: #2563eb;        /* Main brand color (blue) */
--accent-dark: #1e40af;   /* Hover state */
```

Change to your preferred color (hex format):
- Professional Red: `#dc2626`
- Modern Purple: `#9333ea`
- Aggressive Black: `#000000`

Example for red:
```css
--accent: #dc2626;
--accent-dark: #b91c1c;
```

---

## Video Hero Section

**File:** `index.html` (Lines 40-45)

Replace the YouTube video placeholder:

```html
<iframe width="100%" height="100%" 
    src="https://www.youtube.com/embed/YOUR_VIDEO_ID" 
    title="Your Video Title" 
    frameborder="0" 
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
    allowfullscreen>
</iframe>
```

To get `YOUR_VIDEO_ID`:
- Full YouTube URL: `https://www.youtube.com/watch?v=abc123xyz`
- Extract: `abc123xyz`
- Use in iframe: `https://www.youtube.com/embed/abc123xyz`

---

## Free Resources / Downloads

**File:** `index.html` (Lines 54-71)

Edit the cards and setup downloads:

```html
<div class="resource-card">
    <h3>Your PDF Title</h3>
    <p>Brief description of the PDF.</p>
    <a href="/assets/pdfs/your-file.pdf" class="btn btn-outline">Download</a>
</div>
```

**Steps:**
1. Create `/assets/pdfs/` folder
2. Add your PDF files there
3. Update the href path
4. (Optional) Use a service like Gumroad or SendOwl to handle email capture on download

---

## Free Form Integrations (Recommended)

### Option 1: Formspree (Simplest)
1. Sign up: https://formspree.io
2. Create new form
3. Get form ID: `f/xyz123`
4. Paste in `js/main.js` → `FORM_ENDPOINTS`
5. Done! Emails go to your inbox

### Option 2: MailerLite (Best for Automation)
1. Sign up: https://mailerlite.com
2. Create a form
3. Get form submission endpoint
4. Connect to automation workflows

### Option 3: Klaviyo (E-Commerce Focus)
1. Sign up: https://www.klaviyo.com
2. Create signup form
3. Use their form endpoint

---

## Deployment Options

### Option A: Netlify (Easiest for Static Sites)
1. Zip your `d:\Jasons Web` folder
2. Go to https://app.netlify.com/drop
3. Drag & drop the folder
4. Get free live URL instantly
5. Custom domain: $12-15/year

### Option B: GitHub Pages (Free)
1. Create GitHub account
2. Create repository: `username.github.io`
3. Push your files
4. Site goes live automatically

### Option C: Traditional Hosting
1. Get hosting from Bluehost, GoDaddy, SiteGround
2. Upload files via FTP
3. Connect domain

---

## Performance Tips

1. **Optimize images:** Use TinyPNG.com to compress
2. **Lazy load YouTube:** The player loads on-demand
3. **Minify CSS/JS:** Use minifier if you grow the site
4. **Cache busting:** Add `?v=1` to file links if updates don't show

---

## Mobile Testing

Test on real devices using:
- Chrome DevTools (F12 → Toggle Device Toolbar)
- BrowserStack: https://www.browserstack.com

---

## SEO Basics

**Update in `index.html` (Line 5):**
```html
<title>Your Brand - Fitness Training & Programs</title>
```

**Add meta description (after line 4):**
```html
<meta name="description" content="Premium fitness training programs and resources for serious results.">
```

---

## Common Issues & Fixes

**Issue:** Form not working
- **Fix:** Replace `FORM_ENDPOINTS` with real Formspree URL

**Issue:** YouTube video not showing
- **Fix:** Verify video ID is correct in embed URL

**Issue:** Checkout buttons not working
- **Fix:** Replace `CHECKOUT_URLS` with real checkout links

**Issue:** Mobile menu not toggling
- **Fix:** Check that `hamburger` button has id="hamburger"

---

## Support Resources

- **HTML Basics:** https://developer.mozilla.org/en-US/docs/Web/HTML
- **CSS Reference:** https://developer.mozilla.org/en-US/docs/Web/CSS
- **JavaScript Guide:** https://developer.mozilla.org/en-US/docs/Web/JavaScript
- **YouTube Data:** https://www.youtube.com/results?search_query=get+video+id

---

## Next Steps (Optional Enhancements)

1. Add Google Analytics
2. Set up email automation
3. Add testimonial images
4. Create blog section
5. Add live chat support
6. Set up email sequences

---

**Build Date:** January 18, 2026  
**Tech Stack:** HTML5 + CSS3 + JavaScript (No frameworks)  
**Performance:** Fast, Lightweight, Production-Ready
