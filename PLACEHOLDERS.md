# TheOBlueprint - Placeholder Reference

**Quick checklist of all places you need to add YOUR information:**

## 🔴 CRITICAL (Must Update Before Launch)

### 1. Form Endpoints
**File:** `js/main.js` lines 14-20
```
☐ Resources form endpoint (Formspree/MailerLite/Klaviyo)
☐ Contact form endpoint
```

### 2. Checkout URLs
**File:** `js/main.js` lines 22-25
```
☐ Training program checkout URL
☐ Notebook checkout URL
```

### 3. YouTube Shorts
**File:** `js/main.js` lines 9-34
```
☐ Add your actual YouTube Shorts URLs
☐ Add your actual thumbnail URLs
☐ Update all video titles
```

---

## 🟡 IMPORTANT (Should Update Before Launch)

### 4. Social Links
**File:** `index.html` lines 231-235
```
☐ YouTube channel link
☐ Instagram profile link
```

### 5. Hero Video
**File:** `index.html` lines 40-45
```
☐ Replace placeholder YouTube video with your hero video
```

### 6. Brand Name & Copy
**File:** `index.html`
```
☐ Navbar brand name (line 14)
☐ Hero title (line 34)
☐ Hero subtitle (line 35)
☐ Footer mission statement (line 239-240)
```

### 7. Product Prices
**File:** `index.html`
```
☐ Training program monthly price (line 118)
☐ Training program 3-month price (line 125)
☐ Notebook price (line 142)
```

---

## 🟢 NICE-TO-HAVE (Optional)

### 8. Brand Colors
**File:** `css/main.css` lines 6-16
```
☐ Update --accent color (default: blue #2563eb)
☐ Update --accent-dark color (default: #1e40af)
```

### 9. Free Resources PDFs
**File:** `index.html` lines 54-71
```
☐ Add actual PDF download links
☐ Create /assets/pdfs/ folder
☐ Upload your PDF files
```

### 10. Testimonials
**File:** `index.html` lines 186-205
```
☐ Replace placeholder testimonials with real quotes
☐ Add real customer names
```

---

## 📝 FORM & PAYMENT SETUP DETAILS

### Formspree Setup (Recommended for Email Forms)
1. Go to: https://formspree.io
2. Sign up with email
3. Create new form
4. Name it (e.g., "TheOBlueprint Contact")
5. Add your email address
6. Copy the form ID shown (format: f/abc123xyz)
7. Paste in `js/main.js` line 15: `https://formspree.io/f/abc123xyz`
8. Test the form

### Stripe Setup (Recommended for Payments)
1. Go to: https://stripe.com
2. Create account
3. Set up your first product
4. Get checkout link from Stripe dashboard
5. Paste in `js/main.js` line 23 (training) or 24 (notebook)

### Gumroad Setup (Easy Alternative for Products)
1. Go to: https://gumroad.com
2. Create account
3. Upload your training program or notebook details
4. Get product link
5. Paste in checkout URLs

---

## 🚀 QUICK SETUP ORDER

1. **First:** Update form endpoints (js/main.js lines 14-20)
2. **Second:** Update checkout URLs (js/main.js lines 22-25)
3. **Third:** Add your YouTube Shorts (js/main.js lines 9-34)
4. **Fourth:** Update brand name & copy (index.html)
5. **Fifth:** Update social links (index.html)
6. **Sixth:** Test everything locally
7. **Seventh:** Deploy to Netlify/GitHub Pages

---

## 🧪 TESTING CHECKLIST

```
☐ Navbar toggles on mobile
☐ All links scroll smoothly
☐ Forms submit without errors
☐ YouTube Shorts display & open on click
☐ Products show correct pricing
☐ Checkout buttons work
☐ Mobile menu closes when link clicked
☐ All text displays correctly
☐ Images load without breaking
☐ No console errors (F12 → Console tab)
```

---

## 📱 MOBILE TEST DEVICES

```
☐ iPhone SE (375px)
☐ iPhone 12 (390px)
☐ Android phone (360px)
☐ Tablet (768px)
☐ Desktop (1200px+)
```

Use Chrome DevTools: F12 → Click phone icon → Select device

---

## 📊 ANALYTICS (Optional Addition)

To add Google Analytics:

Add this before `</head>` in index.html:
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-YOUR_ID"></script>
<script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-YOUR_ID');
</script>
```

Replace `G-YOUR_ID` with your Google Analytics ID from: https://analytics.google.com

---

## 💡 PRO TIPS

1. **Test forms before launch:** Use your own email first
2. **Use UTM parameters:** Track which links work best
3. **Keep backups:** Save copies of working files
4. **Update content regularly:** Fresh shorts + testimonials = better SEO
5. **Monitor form submissions:** Check email daily for leads
6. **A/B test copy:** Try different CTAs to improve conversions

---

## ❌ COMMON MISTAKES TO AVOID

- ❌ Leaving placeholder URLs (forms won't work)
- ❌ Not testing mobile view
- ❌ Using too many different fonts
- ❌ Forgetting social links
- ❌ Not updating checkout URLs
- ❌ Poor email form endpoints

---

**Last Updated:** January 18, 2026
