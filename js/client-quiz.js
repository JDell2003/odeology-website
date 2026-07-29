/* BetterMe-style client onboarding quiz.
   One question per screen, tap-to-advance, section progress bar,
   interstitial "message" screens, BMI + projection graph, loading
   screen, then a FREE plan-ready page. Mounted by index.html's entry
   flow at the client path's `quiz` step; answers are mapped back onto
   the existing intake fields so plan generation is unchanged. */
(() => {
    'use strict';

    const SECTIONS = [
        { id: 'profile', label: 'My Profile' },
        { id: 'history', label: 'History' },
        { id: 'activity', label: 'Activity' },
        { id: 'nutrition', label: 'Nutrition' },
        { id: 'mind', label: 'Emotions & Behavior' },
        { id: 'lifestyle', label: 'Lifestyle & Habits' },
        { id: 'tracking', label: 'Tracking' },
        { id: 'goals', label: 'Body Goals' }
    ];

    /* ---------- inline SVG art (stylized silhouettes / icons) ---------- */
    const torso = (waist, definition = false, shoulders = 34) => `
        <svg viewBox="0 0 100 120" class="bm-figure" aria-hidden="true">
            <circle cx="50" cy="16" r="11" class="bm-fig-skin"></circle>
            <path class="bm-fig-skin" d="M50 28
                C ${50 - shoulders} 30, ${50 - shoulders - 2} 40, ${50 - shoulders + 4} 52
                C ${50 - waist} 66, ${50 - waist} 78, ${50 - waist + 2} 92
                L ${50 + waist - 2} 92
                C ${50 + waist} 78, ${50 + waist} 66, ${50 + shoulders - 4} 52
                C ${50 + shoulders + 2} 40, ${50 + shoulders} 30, 50 28 Z"></path>
            <rect x="${50 - waist + 1}" y="90" width="${(waist - 1) * 2}" height="26" rx="7" class="bm-fig-shorts"></rect>
            ${definition ? `
                <path class="bm-fig-line" d="M50 34 v46"></path>
                <path class="bm-fig-line" d="M38 44 h24"></path>
                <path class="bm-fig-line" d="M40 58 h20"></path>
                <path class="bm-fig-line" d="M41 70 h18"></path>` : ''}
        </svg>`;

    const figureFemale = () => `
        <svg viewBox="0 0 100 120" class="bm-figure" aria-hidden="true">
            <circle cx="50" cy="15" r="10" class="bm-fig-skin"></circle>
            <path class="bm-fig-skin" d="M50 26
                C 24 29, 22 38, 28 50 C 34 60, 36 64, 34 74
                C 30 86, 32 92, 36 92 L 64 92
                C 68 92, 70 86, 66 74 C 64 64, 66 60, 72 50
                C 78 38, 76 29, 50 26 Z"></path>
            <rect x="34" y="90" width="32" height="26" rx="8" class="bm-fig-shorts"></rect>
            <path class="bm-fig-line" d="M40 42 h20"></path>
        </svg>`;

    const ZONE_ICONS = {
        arms: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 34c2-8 6-14 12-18l6-4 6 4c2 2 3 5 2 8l-4 10" fill="none"/><path d="M22 20c4 0 8 3 8 8" fill="none"/></svg>',
        pecs: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 12h24v10c0 6-5 10-12 10s-12-4-12-10V12Z" fill="none"/><path d="M24 12v20M14 22h20" fill="none"/></svg>',
        belly: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="14" y="10" width="20" height="28" rx="8" fill="none"/><path d="M24 12v24M16 20h16M16 28h16" fill="none"/></svg>',
        legs: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M16 8c0 12-2 20 0 30M32 8c0 12 2 20 0 30M16 38l-2 4M32 38l2 4" fill="none"/></svg>',
        back: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 10c6 4 14 4 20 0v14c0 8-4 14-10 16-6-2-10-8-10-16V10Z" fill="none"/><path d="M24 12v26" fill="none"/></svg>',
        butt: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 22c0-6 5-10 12-10s12 4 12 10c0 8-4 14-12 16-8-2-12-8-12-16Z" fill="none"/><path d="M24 16v20" fill="none"/></svg>',
        kneePain: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M20 6c0 10-2 16 0 22l-4 14M30 6c0 10 2 16 0 22" fill="none"/><circle cx="24" cy="30" r="6" fill="none"/><path d="M33 26l4-4M35 32h5M32 20l3-5" fill="none"/></svg>',
        backPain: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M22 6c-4 10-4 22 0 34" fill="none"/><circle cx="28" cy="24" r="6" fill="none"/><path d="M36 18l4-4M38 26h6M35 12l2-5" fill="none"/></svg>',
        check: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16" fill="none"/><path d="M16 24l6 6 11-12" fill="none"/></svg>'
    };

    /* ---------- screen definitions ---------- */
    const SCREENS = [
        { id: 'gender', section: 'profile', type: 'gender' },
        { id: 'ageRange', section: 'profile', type: 'choice', title: 'What’s your age?', options: ['18 – 29', '30 – 39', '40 – 49', '50+'] },
        { id: 'sourceHeard', section: 'profile', type: 'choice', title: 'Where did you hear about us?', subtitle: 'Helps us find more people like you.', options: [
            'TikTok', 'Instagram', 'YouTube', 'Google search', 'Friend or family', 'My gym', 'Podcast', 'Other'
        ] },
        { id: 'expectedFeature', section: 'profile', type: 'choice', title: 'Which feature are you most excited for?', options: [
            'AI workout plans', 'Meal plans + groceries', 'The Arena rankings', 'Progress tracking', 'Finding a coach', 'The community'
        ] },
        {
            id: 'social1', type: 'info', kicker: 'RiseForIt',
            title: (a) => `Thousands of people ${a.ageRange ? `in their ${a.ageRange.startsWith('18') ? '20s' : a.ageRange.startsWith('30') ? '30s' : a.ageRange.startsWith('40') ? '40s' : 'prime'}` : 'like you'} train with RiseForIt`,
            body: 'Real plans, real food, real progress — built around your life.',
            art: 'trio'
        },
        { id: 'build', section: 'profile', type: 'cards', title: 'How would you describe your physical build?', options: [
            { value: 'Slender', art: () => torso(16, false, 26) },
            { value: 'Medium build', art: () => torso(22, false, 30) },
            { value: 'Stocky', art: () => torso(28, false, 32) },
            { value: 'Significantly overweight', art: () => torso(34, false, 33) }
        ] },
        { id: 'bodyGoal', section: 'profile', type: 'cards', title: "What's your body goal?", options: [
            { value: 'A few sizes smaller', art: () => torso(19, false, 28) },
            { value: 'Athletic', art: () => torso(20, true, 32) },
            { value: 'Ripped', art: () => torso(18, true, 34) },
            { value: 'Swole', art: () => torso(24, true, 38) }
        ] },
        { id: 'pillarGoals', section: 'profile', type: 'multi', minSelect: 2, title: 'What do you want out of this?', subtitle: 'Your plan — and your stats — focus on what you pick.', options: [
            { value: 'strength', label: 'Get stronger / build muscle' },
            { value: 'cardio', label: 'Build endurance / cardio' },
            { value: 'consistency', label: 'Show up consistently / build the habit' },
            { value: 'nutrition', label: 'Eat better / dial in nutrition' },
            { value: 'recovery', label: 'Recover & sleep better' },
            { value: 'progress', label: 'See visible body change' }
        ] },
        { id: 'weightChange', section: 'profile', type: 'choice', title: 'How does your weight typically change?', options: [
            'I gain weight fast but lose it slowly',
            'I gain and lose weight easily',
            'I struggle to gain weight or muscle'
        ] },
        { id: 'weightEvents', section: 'profile', type: 'multi', title: 'Have any of the following led to weight change in the last few years?', options: [
            'Work pressure', 'Busy family life', 'Divorce or breakup', 'Slower metabolism due to aging', 'Financial challenges', 'An injury or illness', 'Other stressful events', 'None of the above'
        ] },
        { id: 'promise1', type: 'info', kicker: 'RiseForIt', title: "We know how to make that happen!", body: "RiseForIt doesn't believe in one-size-fits-all solutions.\nWe'll create a personalized plan to help you reach your goal at your own pace — and enjoy it.", art: 'check' },

        /* HISTORY: where you're starting from. Everyone begins a Peasant — these
           six answers set HOW STRONG a peasant (the seed of each spider axis).
           Option strings are matched verbatim by js/identity-engine.js
           (HISTORY_READINESS) — keep them in sync. */
        { id: 'historyIntro', type: 'info', kicker: 'Your history', title: 'Where are you starting from?', body: "Six quick reads on your current level. Everyone starts as a Peasant — your honest answers set how strong a Peasant, and shape your very first spider graph.", art: 'chapters' },
        { id: 'histStrength', section: 'history', type: 'choice', title: 'How strong are you right now?', options: [
            "I'm just getting started", 'I can handle the basics', "I'm pretty strong", "I'm advanced / very strong"
        ] },
        { id: 'histCardio', section: 'history', type: 'choice', title: "How's your cardio and endurance?", options: [
            'I get winded fast', 'I can do light cardio', "I'm fairly conditioned", 'I have great endurance'
        ] },
        { id: 'histConsistency', section: 'history', type: 'choice', title: 'How consistent have you been lately?', options: [
            'I keep falling off', 'On and off', 'Mostly consistent', 'Locked in every week'
        ] },
        { id: 'histNutrition', section: 'history', type: 'choice', title: 'How dialed-in is your nutrition?', options: [
            'I eat whatever', 'I try but slip', 'Mostly clean', 'Very dialed in'
        ] },
        { id: 'histSleep', section: 'history', type: 'choice', title: "How's your sleep and recovery?", options: [
            'Poor and restless', 'Hit or miss', 'Usually solid', 'Great — I wake up refreshed'
        ] },
        { id: 'histProgress', section: 'history', type: 'choice', title: 'How much progress have you made so far?', options: [
            'Starting from scratch', 'A little progress', 'Solid progress', "I'm already in great shape"
        ] },

        { id: 'alsoAchieve', section: 'activity', type: 'multi', title: 'What else do you hope to achieve with this plan?', options: [
            'Build muscle strength', 'Add muscle definition', 'Improve posture', 'Develop flexibility', 'Improve overall fitness', 'None of the above'
        ] },
        { id: 'dailyActivity', section: 'activity', type: 'choice', title: 'How active are you on a typical day?', options: [
            'I spend most of the day sitting', 'I take active breaks', "I'm on my feet all day long"
        ] },
        { id: 'energy', section: 'activity', type: 'choice', title: 'How are your energy levels during the day?', options: [
            'Low, I feel tired throughout the day', 'Post lunch slump', 'Dragging before meals', 'High and steady'
        ] },
        { id: 'walks', section: 'activity', type: 'choice', title: 'How often do you go for walks?', options: [
            'Almost every day', '3-4 times a week', '1-2 times a week', 'More like once a month'
        ] },
        { id: 'exerciseFreq', section: 'activity', type: 'choice', title: 'How often do you exercise?', options: [
            'Almost every day', 'Several times a week', 'Several times a month', 'Never'
        ] },
        { id: 'exerciseTime', section: 'activity', type: 'choice', title: 'How much time do you have for exercise on a typical day?', options: [
            '10-20 min', '20-30 min', '30-40 min', '40-60 min'
        ] },
        { id: 'promise2', type: 'info', kicker: 'RiseForIt', title: 'Short sessions, major results!', body: "Strength, general fitness, HIIT, stretching: you name it, we got it.\nLet's create a routine that fits your lifestyle.", art: 'workouts' },
        { id: 'workoutFreq', section: 'activity', type: 'choice', title: 'How often do you want to work out?', options: [
            '1 - 3 times a week', '4 - 5 times a week', '6 - 7 times a week', 'Not sure yet'
        ] },
        { id: 'workoutTime', section: 'activity', type: 'multi', title: 'What time of the day do you prefer to work out?', options: [
            'Morning', 'Midday', 'Afternoon', 'Evening'
        ] },
        { id: 'equipmentQ', section: 'activity', type: 'multi', title: 'What equipment do you have access to?', options: [
            'Full gym', 'Dumbbells', 'Barbell', 'Machines', 'Cables', 'Bodyweight only'
        ] },
        { id: 'targetZones', section: 'activity', type: 'multi', title: 'What are your target zones?', icons: { Arms: 'arms', Pecs: 'pecs', Belly: 'belly', Legs: 'legs', Back: 'back', Butt: 'butt' }, options: [
            'Arms', 'Pecs', 'Belly', 'Legs', 'Back', 'Butt'
        ] },
        { id: 'promise3', type: 'info', kicker: 'RiseForIt', title: 'Grow muscle and get stronger day by day', body: 'Receive a step-by-step workout program to tone up each target zone.', art: 'program' },
        { id: 'breath', section: 'activity', type: 'choice', title: 'How often do you experience shortness of breath?', options: [
            'Very often', 'Only when active', 'Occasionally', 'Almost never'
        ] },
        { id: 'discomfort', section: 'activity', type: 'choice', title: 'Do you experience discomfort or tension when working out?', options: [
            'Yes', 'No', "I don't know"
        ] },
        { id: 'struggles', section: 'activity', type: 'multi', title: 'Do you struggle with any of the following?', icons: { 'Sensitive back': 'backPain', 'Sensitive knees': 'kneePain', 'None of the above': 'check' }, options: [
            'Sensitive back', 'Sensitive knees', 'None of the above'
        ] },
        { id: 'gotYou', type: 'info', kicker: 'RiseForIt', title: 'We got you!', body: (a) => (Array.isArray(a.struggles) && a.struggles.some((s) => s !== 'None of the above'))
            ? 'Your plan will include gentle exercises that protect sensitive joints while you get stronger.\nThis helps reduce tension and improve posture.'
            : "Great — we'll build your plan at full range and keep an eye on your form cues.", art: 'check' },

        { id: 'nutritionHabits', section: 'nutrition', type: 'choice', title: 'How would you describe your nutrition habits?', options: [
            "My diet is on point and I'd like to keep it that way", 'I know how I should eat but old habits get in the way', 'I simply eat whatever I want'
        ] },
        { id: 'badHabits', section: 'nutrition', type: 'multi', title: 'Do you have any of the following habits?', options: [
            'Overeating', 'Boredom eating', 'Late-night snacking', 'Skipping meals too often', 'None of the above'
        ] },
        { id: 'cravings', section: 'nutrition', type: 'multi', title: 'What foods do you crave most often?', options: [
            'Sweet treats', 'Salty snacks', 'Fast food', 'Soda', 'None of the above'
        ] },
        { id: 'mealPlanning', section: 'nutrition', type: 'choice', title: 'How do you typically plan your meals?', options: [
            'I eat without any planning', "I have a general idea of what I'll eat", 'I decide my meals a day ahead', 'I plan all my meals in advance'
        ] },
        { id: 'mealsPromo', type: 'info', kicker: 'RiseForIt', title: 'Optimize nutrition with a personalized meal plan', body: 'Quick, simple and balanced recipes will make you enjoy every bite — with the grocery list built for you.', art: 'meals' },
        /* Meal Program (Part 2): the picture-picker + budget + dietary live INSIDE onboarding.
           Photo grids reuse the meal-program engine/dataset (window.MealProgramEngine /
           window.MealProgramData, loaded by index.html); screens auto-skip when unavailable
           so the quiz never breaks offline. */
        { id: 'mealPicksBreakfast', section: 'nutrition', type: 'mealGrid', slot: 'breakfast', minSelect: 2, title: 'Pick breakfasts you’d actually eat', subtitle: 'Tap the photos — your 7-day plan is built from these.', skipIf: () => !(window.MealProgramEngine && window.MealProgramData) },
        { id: 'mealPicksLunch', section: 'nutrition', type: 'mealGrid', slot: 'lunch', minSelect: 3, title: 'Now pick your lunches', subtitle: 'At least 3 — repeats are meal-prep friendly.', skipIf: () => !(window.MealProgramEngine && window.MealProgramData) },
        { id: 'mealPicksDinner', section: 'nutrition', type: 'mealGrid', slot: 'dinner', minSelect: 3, title: 'And your dinners', subtitle: 'Snacks get added automatically to hit your calorie and protein targets.', skipIf: () => !(window.MealProgramEngine && window.MealProgramData) },
        { id: 'mealBudget', section: 'nutrition', type: 'choice', title: 'What’s your monthly grocery budget?', subtitle: 'Here’s the real tradeoff: the more you can spend, the more protein we pack in — and protein is what builds muscle, keeps you full, and helps you feel your best. On a tighter budget we protect your protein where it matters most and fill the rest of your calories with cheaper carbs, so you still hit your goal. Quality dips a little, but you’ll very likely still get there.', options: [
            { value: 'Under $200', desc: 'Leanest budget. Protein goes where it counts; the rest of your calories come from affordable carbs. Less variety, still on track.' },
            { value: 'Around $300', desc: 'More protein in every meal and a bit more variety and quality.' },
            { value: 'Around $400', desc: 'High protein across the board — better quality, food you’ll actually enjoy.' },
            { value: '$500 or more', desc: 'Max protein tier: the most muscle, the best you’ll feel, and the widest food choice.' }
        ] },
        { id: 'mealState', section: 'nutrition', type: 'stateSelect', title: 'Which state do you shop in?', subtitle: 'Grocery prices adjust to your area.', skipIf: () => !(window.MealProgramEngine && window.MealProgramData) },
        { id: 'dietaryPref', section: 'nutrition', type: 'choice', title: 'Any dietary preference?', options: ['No restrictions', 'Vegetarian', 'Vegan', 'Pescatarian', 'No red meat'] },
        { id: 'allergies', section: 'nutrition', type: 'multi', title: 'Any food allergies?', options: ['Fish', 'Eggs', 'Dairy', 'Gluten', 'None of the above'] },
        { id: 'mealPrep', section: 'nutrition', type: 'choice', title: 'How do you usually prepare your meals?', options: [
            'I cook them myself', 'Someone else cooks for me', 'I order from restaurants', 'I eat premade meals'
        ] },
        { id: 'knowCalories', section: 'nutrition', type: 'choice', title: 'Do you know your daily calorie needs for your goal?', options: ['Yes', 'No'] },
        { id: 'caloriePromo', type: 'info', kicker: 'RiseForIt', title: 'Track your calorie intake effortlessly', body: "Calorie deficit is key for weight loss, while calorie surplus is essential for muscle gain.\nWe'll calculate your optimal daily intake and help you stay on track.", art: 'calories' },

        { id: 'agree1', section: 'mind', type: 'scale', title: '‘No matter how hard I try, the results always slip away’' },
        { id: 'agree4', section: 'mind', type: 'scale', title: '‘Getting in shape is tough. I try for a bit, but then I slip back into old habits’' },
        { id: 'habitsPromo', type: 'info', kicker: 'RiseForIt', title: 'Supercharge your results with better habits', body: "We'll work with your emotions and behavior to improve your habits.\nThis helps you make progress easily and keep it long-term.", art: 'chapters' },

        { id: 'sleepHours', section: 'lifestyle', type: 'choice', title: 'How much sleep do you usually get?', options: [
            'Less than 5 hours', '5-6 hours', '7-8 hours', 'More than 8 hours'
        ] },
        { id: 'sleepIssues', section: 'lifestyle', type: 'multi', title: 'Have you experienced any of these over the past month?', options: [
            'Tossed and turned throughout the night', 'Had trouble falling asleep', 'Woke up multiple times during the night', 'Found it hard to prioritize sleep', 'None of the above'
        ] },
        { id: 'morningFeel', section: 'lifestyle', type: 'choice', title: "How do you usually feel during the day after a night's sleep?", options: [
            'Energetic and ready to tackle the day', 'Moderately alert, but with some difficulty focusing', 'Struggling to stay awake and alert', 'Completely drained and unable to function'
        ] },
        { id: 'sleepPromo', type: 'info', kicker: 'RiseForIt', title: 'Improve sleep for a massive energy boost', body: 'Your plan optimizes recovery, so you wake up refreshed and revitalized.', art: 'sleep' },

        { id: 'spiderIntro', type: 'spider' },
        { id: 'permSteps', section: 'tracking', type: 'choice', title: 'Can we count your daily steps?', subtitle: 'Steps feed your Cardio and Consistency stats automatically — no logging needed.', options: [
            'Yes — track my steps', 'Not right now'
        ] },
        { id: 'cardioSource', section: 'tracking', type: 'choice', title: 'Want us to track your runs & cardio?', subtitle: 'Pick how cardio gets logged — it feeds your Cardio stat at the device-verified tier.', options: [
            'Use RiseForIt’s built-in tracker',
            // Strava import isn't live yet — show it, but non-clickable.
            { value: 'Connect Strava (beta)', label: 'Connect Strava', tag: 'Coming soon', disabled: true },
            'Not now'
        ] },
        { id: 'permSleep', section: 'tracking', type: 'choice', title: 'Sync sleep from your sleep app?', subtitle: 'Sleep hours feed your Recovery stat while you do nothing at all.', options: [
            'Yes — sync my sleep', 'Not right now'
        ] },
        { id: 'wakeTime', section: 'tracking', type: 'time', title: 'What time do you usually wake up?', subtitle: 'Waking up on time earns Consistency points every single day.' },

        { id: 'height', section: 'goals', type: 'height', title: 'How tall are you?' },
        { id: 'weight', section: 'goals', type: 'weight', title: "What's your current weight?" },
        { id: 'goalWeight', section: 'goals', type: 'goalWeight', title: "Got it! And what's your goal weight?" },
        { id: 'age', section: 'goals', type: 'age', title: "What's your age?" },
        { id: 'wellness', type: 'bmi' },
        { id: 'event', section: 'goals', type: 'choice', title: 'Do you have an important event coming up?', subtitle: 'Having something to look forward to can be a great motivator for reaching your goal', options: [
            'Vacation', 'Wedding', 'Holiday', 'Sporting event', 'Reunion', 'Birthday', 'Other', 'No events any time soon'
        ] },
        { id: 'projection', type: 'projection' },
        { id: 'confidence', section: 'goals', type: 'choice', title: (a) => `How confident are you in reaching ${goalWeightLabel(a)}?`, options: [
            'I believe I can do it!', "I'm uncertain, but willing to try!", "I'm still really unsure"
        ] },
        { id: 'mainReason', section: 'goals', type: 'choice', title: "What's your main reason to get in shape?", options: [
            'Become more confident in my body', 'Feel healthier and more energetic', 'Fit in my clothes better', 'Participate in activities and hobbies with ease', 'Other'
        ] },
        { id: 'loading', type: 'loading' },
        { id: 'plan', type: 'plan' }
    ];

    /* ---------- helpers ---------- */
    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const resolve = (v, answers) => (typeof v === 'function' ? v(answers) : v);

    function weightLb(a) {
        const w = Number(a.weightValue);
        if (!Number.isFinite(w) || w <= 0) return null;
        return a.weightUnit === 'kg' ? w * 2.20462 : w;
    }
    function goalWeightLb(a) {
        const w = Number(a.goalWeightValue);
        if (!Number.isFinite(w) || w <= 0) return null;
        return a.goalWeightUnit === 'kg' ? w * 2.20462 : w;
    }
    function goalWeightLabel(a) {
        const v = Number(a.goalWeightValue);
        return Number.isFinite(v) && v > 0 ? `${v} ${a.goalWeightUnit || 'lbs'}` : 'your goal';
    }
    function heightInches(a) {
        if (a.heightUnit === 'cm') {
            const cm = Number(a.heightCm);
            return Number.isFinite(cm) && cm > 0 ? cm / 2.54 : null;
        }
        const ft = Number(a.heightFt);
        const inch = Number(a.heightIn || 0);
        return Number.isFinite(ft) && ft > 0 ? ft * 12 + inch : null;
    }
    function bmi(a) {
        const lb = weightLb(a);
        const inches = heightInches(a);
        if (!lb || !inches) return null;
        return (703 * lb) / (inches * inches);
    }
    const bmiClass = (v) => (v < 18.5 ? 'Underweight' : v < 25 ? 'Normal' : v < 30 ? 'Overweight' : 'Obese');

    function goalDate(a) {
        const now = weightLb(a);
        const goal = goalWeightLb(a);
        // ~1.5 lb/week loss, ~0.5 lb/week lean gain; min 4 weeks so it never reads as instant.
        let weeks = 8;
        if (now && goal) {
            const delta = now - goal;
            weeks = delta > 0 ? Math.ceil(delta / 1.5) : Math.ceil(Math.abs(delta) / 0.5);
        }
        weeks = clamp(weeks, 4, 78);
        const d = new Date();
        d.setDate(d.getDate() + weeks * 7);
        return d;
    }
    const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    /* ---------- outputs: map quiz answers onto the existing intake ---------- */
    function mapAnswers(a) {
        const zoneMap = { Arms: 'Arms', Pecs: 'Chest', Belly: 'Abs', Legs: 'Quads', Back: 'Back', Butt: 'Hamstrings/Glutes' };
        const goalMap = {
            'A few sizes smaller': { goal: 'Lose fat', phase: 'Cut / Definition' },
            'Athletic': { goal: 'Build muscle', phase: 'Maintain / Recomp' },
            'Ripped': { goal: 'Build muscle', phase: 'Cut / Definition' },
            'Swole': { goal: 'Build muscle', phase: 'Bulk' }
        };
        const expMap = { 'Never': '0-6m', 'Several times a month': '0-6m', 'Several times a week': '6-18m', 'Almost every day': '18-36m' };
        const daysMap = { '1 - 3 times a week': '3', '4 - 5 times a week': '5', '6 - 7 times a week': '6', 'Not sure yet': '3' };
        const timeMap = { '10-20 min': '30-45', '20-30 min': '30-45', '30-40 min': '30-45', '40-60 min': '45-60' };

        const injuries = [];
        (a.struggles || []).forEach((s) => {
            if (s === 'Sensitive back') injuries.push('Lower back');
            if (s === 'Sensitive knees') injuries.push('Knee');
        });
        if (!injuries.length) injuries.push('No pain');

        let height = '';
        if (a.heightUnit === 'cm' && a.heightCm) height = `${a.heightCm} cm`;
        else if (a.heightFt) height = `${a.heightFt}'${a.heightIn || 0}"`;
        const weight = a.weightValue ? `${a.weightValue} ${a.weightUnit === 'kg' ? 'kg' : 'lb'}` : '';
        const chosen = goalMap[a.bodyGoal] || { goal: 'Build muscle', phase: 'Maintain / Recomp' };

        return {
            sex: a.gender === 'Female' ? 'Female' : 'Male',
            age: String(a.ageYears || ''),
            height,
            weight,
            goal: chosen.goal,
            phase: chosen.phase,
            experience: expMap[a.exerciseFreq] || '0-6m',
            daysPerWeek: daysMap[a.workoutFreq] || '3',
            timePerSession: timeMap[a.exerciseTime] || '30-45',
            equipment: (a.equipmentQ && a.equipmentQ.length) ? a.equipmentQ.slice() : ['Bodyweight only'],
            injuries,
            priorityMuscles: (a.targetZones || []).map((z) => zoneMap[z]).filter(Boolean).slice(0, 3),
            stepTracking: String(a.permSteps || '').startsWith('Yes'),
            sleepTracking: String(a.permSleep || '').startsWith('Yes'),
            wakeTime: String(a.wakeTime || '')
        };
    }

    /* Seed the six identity stats (0-100) from the quiz. */
    function computeStats(a) {
        const pick = (val, table, fallback) => (table[val] != null ? table[val] : fallback);
        const consistency = clamp(
            pick(a.exerciseFreq, { 'Never': 15, 'Several times a month': 35, 'Several times a week': 65, 'Almost every day': 88 }, 30)
            + (a.walks === 'Almost every day' ? 5 : 0), 5, 95);
        const cardio = clamp(Math.round((
            pick(a.walks, { 'Almost every day': 80, '3-4 times a week': 62, '1-2 times a week': 42, 'More like once a month': 22 }, 40)
            + pick(a.breath, { 'Very often': 15, 'Only when active': 45, 'Occasionally': 60, 'Almost never': 82 }, 50)
            + pick(a.energy, { 'Low, I feel tired throughout the day': 25, 'Post lunch slump': 45, 'Dragging before meals': 45, 'High and steady': 75 }, 50)
        ) / 3), 5, 95);
        let strength = pick(a.build, { 'Slender': 35, 'Medium build': 45, 'Stocky': 42, 'Significantly overweight': 30 }, 40);
        if (a.exerciseFreq === 'Almost every day') strength += 20;
        else if (a.exerciseFreq === 'Several times a week') strength += 12;
        strength = clamp(strength, 5, 95);
        let nutrition = pick(a.nutritionHabits, { "My diet is on point and I'd like to keep it that way": 82, 'I know how I should eat but old habits get in the way': 52, 'I simply eat whatever I want': 26 }, 45);
        nutrition -= ((a.badHabits || []).filter((h) => h !== 'None of the above').length) * 4;
        nutrition -= ((a.cravings || []).filter((c) => c !== 'None of the above').length) * 2;
        nutrition += pick(a.mealPlanning, { 'I plan all my meals in advance': 10, 'I decide my meals a day ahead': 6, "I have a general idea of what I'll eat": 2, 'I eat without any planning': -4 }, 0);
        nutrition = clamp(nutrition, 5, 95);
        let recovery = pick(a.sleepHours, { 'Less than 5 hours': 22, '5-6 hours': 45, '7-8 hours': 75, 'More than 8 hours': 85 }, 50);
        recovery -= ((a.sleepIssues || []).filter((i) => i !== 'None of the above').length) * 5;
        recovery += pick(a.morningFeel, { 'Energetic and ready to tackle the day': 8, 'Moderately alert, but with some difficulty focusing': 0, 'Struggling to stay awake and alert': -6, 'Completely drained and unable to function': -10 }, 0);
        recovery = clamp(recovery, 5, 95);
        const progress = clamp(Math.round((
            pick(a.confidence, { 'I believe I can do it!': 72, "I'm uncertain, but willing to try!": 54, "I'm still really unsure": 36 }, 50)
            + pick(a.weightChange, { 'I gain and lose weight easily': 65, 'I gain weight fast but lose it slowly': 45, 'I struggle to gain weight or muscle': 42 }, 50)
        ) / 2), 5, 95);
        // Tracking permissions pay out immediately, so saying yes visibly
        // moves the radar the first time they see it.
        const stepsOn = String(a.permSteps || '').startsWith('Yes');
        const sleepOn = String(a.permSleep || '').startsWith('Yes');
        const wakeSet = Boolean(a.wakeTime);
        return {
            strength,
            cardio: clamp(cardio + (stepsOn ? 4 : 0), 5, 95),
            consistency: clamp(consistency + (stepsOn ? 3 : 0) + (wakeSet ? 4 : 0), 5, 95),
            nutrition,
            recovery: clamp(recovery + (sleepOn ? 6 : 0), 5, 95),
            progress
        };
    }

    /* ---------- engine ---------- */
    function mount(host, opts = {}) {
        const answers = (opts.answers && typeof opts.answers === 'object') ? opts.answers : {};
        let idx = clamp(Number(opts.startIndex || 0), 0, SCREENS.length - 1);
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let loadingTimer = 0;

        document.body.classList.add('client-quiz-active');

        // Meal Program (Part 2): prefetch the meal catalog so the picker screens
        // render instantly and finish-time plan generation is fast. Best-effort.
        try {
            if (window.MealProgramData && !window.__mpQuizData) {
                window.MealProgramData.load().then((d) => { window.__mpQuizData = d; }).catch(() => {});
            }
        } catch {}

        const root = document.createElement('div');
        root.className = 'bm-quiz';
        host.innerHTML = '';
        host.appendChild(root);

        const persist = () => { try { opts.onProgress && opts.onProgress(answers, idx); } catch {} };

        const answeredCount = (section) => {
            const ids = SCREENS.filter((s) => s.section === section).map((s) => s.id);
            const done = ids.filter((id) => answers[id] != null && String(answers[id]).length !== 0
                || (id === 'height' && heightInches(answers))
                || (id === 'weight' && weightLb(answers))
                || (id === 'goalWeight' && goalWeightLb(answers))
                || (id === 'age' && answers.ageYears)).length;
            return { done, total: ids.length };
        };

        const go = (nextIdx, dir = 1) => {
            nextIdx = clamp(nextIdx, 0, SCREENS.length - 1);
            // skip conditional screens
            while (SCREENS[nextIdx].skipIf && SCREENS[nextIdx].skipIf(answers)) {
                nextIdx = clamp(nextIdx + dir, 0, SCREENS.length - 1);
            }
            if (loadingTimer) { window.clearInterval(loadingTimer); loadingTimer = 0; }
            idx = nextIdx;
            persist();
            render(dir);
        };

        const answerAndAdvance = (screen, value) => {
            answers[screen.id] = value;
            persist();
            const card = root.querySelector('.bm-screen');
            if (card && !reduceMotion) {
                card.classList.add('is-leaving');
                window.setTimeout(() => go(idx + 1), 240);
            } else {
                go(idx + 1);
            }
        };

        /* A returning user who landed in the quiz shouldn't have to answer 40
           questions to reach their account. The host owns auth and decides what
           the way out is ("Log in" vs "Back to my account") — we only render it;
           the click is handled by the host's delegated [data-entry-escape]
           listener. Hidden on the terminal screens, where the page is already
           handing them off. */
        function escapeHatch() {
            const screen = SCREENS[idx] || {};
            if (screen.type === 'loading' || screen.type === 'plan') return null;
            if (typeof opts.escape !== 'function') return null;
            try {
                const esc = opts.escape();
                return (esc && esc.strong) ? esc : null;
            } catch { return null; }
        }

        function topBar(screen) {
            const showBack = idx > 0 && screen.type !== 'loading' && screen.type !== 'plan';
            const sectionIdx = SECTIONS.findIndex((s) => s.id === screen.section);
            const segs = SECTIONS.map((s, i) => {
                let cls = '';
                if (sectionIdx >= 0) {
                    if (i < sectionIdx) cls = 'is-done';
                    else if (i === sectionIdx) cls = 'is-current';
                }
                const { done, total } = answeredCount(s.id);
                const fill = i < sectionIdx ? 100 : (i === sectionIdx && total ? Math.round((done / total) * 100) : 0);
                return `<span class="bm-seg ${cls}"><span style="width:${fill}%"></span></span>`;
            }).join('');
            return `
                <div class="bm-topbar">
                    <button type="button" class="bm-back ${showBack ? '' : 'is-hidden'}" data-bm-back aria-label="Go back">
                        <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg>
                    </button>
                    <div class="bm-topbar-mid">
                        <div class="bm-topbar-title">${esc(screen.section ? (SECTIONS[sectionIdx] || {}).label : 'RiseForIt')}</div>
                        ${screen.section ? `<div class="bm-segs">${segs}</div>` : ''}
                    </div>
                    ${(() => {
                        const hatch = escapeHatch();
                        if (!hatch) return '<span class="bm-topbar-spacer"></span>';
                        return `
                        <button type="button" class="bm-login" data-entry-escape>
                            <span class="bm-login-long">${esc(hatch.lead)} <b>${esc(hatch.strong)}</b></span>
                            <span class="bm-login-short"><b>${esc(hatch.strong)}</b></span>
                        </button>`;
                    })()}
                </div>`;
        }

        // Options are plain strings, or { value, desc } to show a short line
        // under the label explaining what that choice means. { disabled, tag }
        // renders a non-clickable option with a small badge (e.g. "Coming soon").
        const choiceRow = (screen, opt, extra = '') => {
            const value = typeof opt === 'object' ? opt.value : opt;
            const label = typeof opt === 'object' ? (opt.label || opt.value) : opt;
            const desc = typeof opt === 'object' ? (opt.desc || '') : '';
            const tag = typeof opt === 'object' ? (opt.tag || '') : '';
            const disabled = typeof opt === 'object' && !!opt.disabled;
            return `
            <button type="button" class="bm-option ${desc ? 'has-desc' : ''} ${disabled ? 'is-disabled' : ''} ${answers[screen.id] === value ? 'is-selected' : ''}" data-bm-choice="${esc(value)}"${disabled ? ' disabled aria-disabled="true" tabindex="-1"' : ''}>
                <span class="bm-option-label">${esc(label)}${tag ? `<span class="bm-option-tag">${esc(tag)}</span>` : ''}${desc ? `<span class="bm-option-desc">${esc(desc)}</span>` : ''}</span>
                ${extra}
                <span class="bm-radio" aria-hidden="true"></span>
            </button>`;
        };

        // Multi options are plain strings, or { value, label } when the stored
        // value must be a stable id (e.g. the pillar goals contract).
        const multiRow = (screen, opt) => {
            const value = typeof opt === 'object' ? opt.value : opt;
            const label = typeof opt === 'object' ? opt.label : opt;
            const arr = Array.isArray(answers[screen.id]) ? answers[screen.id] : [];
            const iconKey = screen.icons && screen.icons[value];
            return `
                <button type="button" class="bm-option is-multi ${arr.includes(value) ? 'is-selected' : ''}" data-bm-multi="${esc(value)}">
                    <span class="bm-option-label">${esc(label)}</span>
                    ${iconKey ? `<span class="bm-option-icon">${ZONE_ICONS[iconKey] || ''}</span>` : ''}
                    <span class="bm-checkbox" aria-hidden="true"></span>
                </button>`;
        };

        const infoArt = (kind) => {
            if (kind === 'trio') return `<div class="bm-art"><div class="bm-art-row">${torso(20, true, 30)}${torso(19, true, 34)}${torso(22, true, 31)}</div></div>`;
            if (kind === 'workouts') return `<div class="bm-art"><div class="bm-art-cards">
                <div class="bm-mini-card"><strong>Strength Workout</strong><span>11 min</span></div>
                <div class="bm-mini-card"><strong>Fitness at Home</strong><span>16 min</span></div>
                <div class="bm-mini-card"><strong>ABS Workout</strong><span>13 min</span></div>
            </div>${torso(19, true, 34)}</div>`;
            if (kind === 'program') return `<div class="bm-art"><div class="bm-phone">
                <div class="bm-phone-head">Workout Program</div>
                <div class="bm-phone-stats"><div><strong>56</strong> min</div><div><strong>742</strong> kcal</div></div>
                <div class="bm-phone-progress"><span style="width:29%"></span></div>
                <div class="bm-phone-days">${Array.from({ length: 10 }).map((_, i) => `<span class="${i < 8 ? 'is-done' : ''}">${i + 1}</span>`).join('')}</div>
            </div></div>`;
            if (kind === 'meals') return `<div class="bm-art"><div class="bm-meals">
                <div class="bm-meals-title">Your Meals</div>
                <div class="bm-mini-card is-checked"><strong>Breakfast</strong><span>480 kcal · 8 min</span></div>
                <div class="bm-mini-card"><strong>Lunch</strong><span>510 kcal · 20 min</span></div>
                <div class="bm-mini-card"><strong>Dinner</strong><span>435 kcal · 25 min</span></div>
            </div></div>`;
            if (kind === 'calories') return `<div class="bm-art"><div class="bm-phone">
                <div class="bm-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" class="bm-ring-track"></circle><circle cx="60" cy="60" r="50" class="bm-ring-fill" style="stroke-dashoffset: 90"></circle></svg><div class="bm-ring-label"><strong>2 810</strong><span>of 3 000 kcal</span></div></div>
                <div class="bm-phone-macros"><div><span>Carbs</span><strong>0/215 g</strong></div><div><span>Fat</span><strong>32/48 g</strong></div><div><span>Protein</span><strong>87/107 g</strong></div></div>
            </div></div>`;
            if (kind === 'chapters') return `<div class="bm-art"><div class="bm-art-cards">
                <div class="bm-mini-card is-checked"><strong>Chapter 1</strong><span>Start with your mind</span></div>
                <div class="bm-mini-card is-checked"><strong>Chapter 2</strong><span>Check your thoughts and your plate</span></div>
                <div class="bm-mini-card"><strong>Chapter 3</strong><span>Your core beliefs inside and out</span></div>
            </div>${torso(20, true, 32)}</div>`;
            if (kind === 'sleep') return `<div class="bm-art"><div class="bm-sleep">
                <svg viewBox="0 0 120 60" aria-hidden="true"><path d="M8 50 Q 30 10 60 30 T 112 24" fill="none" class="bm-sleep-line"></path></svg>
                <div class="bm-mini-card"><strong>Deep sleep</strong><span>+42% recovery</span></div>
            </div></div>`;
            return `<div class="bm-art"><div class="bm-bigcheck">${ZONE_ICONS.check}</div></div>`;
        };

        function screenBody(screen) {
            const title = resolve(screen.title, answers);
            const subtitle = resolve(screen.subtitle, answers);
            const head = `
                ${title ? `<h2 class="bm-title">${esc(title)}</h2>` : ''}
                ${subtitle ? `<p class="bm-subtitle">${esc(subtitle)}</p>` : ''}`;

            switch (screen.type) {
                case 'gender':
                    return `
                        <div class="bm-brandline">RISEFORIT PLAN</div>
                        <h2 class="bm-title">Build muscle, lose fat and get stronger</h2>
                        <p class="bm-subtitle">A plan built around your body, schedule and kitchen</p>
                        <div class="bm-gender-grid">
                            <button type="button" class="bm-gender-card" data-bm-choice="Male">
                                ${torso(21, true, 33)}
                                <span class="bm-gender-cta">Male <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg></span>
                            </button>
                            <button type="button" class="bm-gender-card" data-bm-choice="Female">
                                ${figureFemale()}
                                <span class="bm-gender-cta">Female <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg></span>
                            </button>
                        </div>
                        <p class="bm-finePrint">By selecting your path and continuing you agree to our <a href="privacy-policy.html" target="_blank" rel="noopener">Privacy Policy</a>.</p>`;
                case 'choice':
                    return `${head}<div class="bm-options">${screen.options.map((o) => choiceRow(screen, o)).join('')}</div>`;
                case 'multi': {
                    const arr = Array.isArray(answers[screen.id]) ? answers[screen.id] : [];
                    const minSelect = Math.max(1, Number(screen.minSelect || 1));
                    return `${head}<p class="bm-hint">${minSelect > 1 ? `Choose at least ${minSelect}` : 'Choose all that apply'}</p>
                        <div class="bm-options">${screen.options.map((o) => multiRow(screen, o)).join('')}</div>
                        <div class="bm-footer"><button type="button" class="bm-cta ${arr.length >= minSelect ? '' : 'is-disabled'}" data-bm-next>NEXT STEP</button></div>`;
                }
                case 'cards':
                    return `${head}<div class="bm-card-grid">${screen.options.map((o) => `
                        <button type="button" class="bm-figure-card ${answers[screen.id] === o.value ? 'is-selected' : ''}" data-bm-choice="${esc(o.value)}">
                            ${o.art()}
                            <span class="bm-figure-caption">${esc(o.value)}<span class="bm-radio"></span></span>
                        </button>`).join('')}</div>`;
                case 'scale':
                    return `${head}<p class="bm-subtitle">Do you agree with this statement?</p>
                        <div class="bm-scale">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="bm-scale-btn ${answers[screen.id] === n ? 'is-selected' : ''}" data-bm-scale="${n}">${n}</button>`).join('')}</div>
                        <div class="bm-scale-legend"><span>Strongly disagree</span><span>Strongly agree</span></div>`;
                case 'spider': {
                    // Hexagon geometry: consistency + recovery axes grow in the
                    // "after" shape so the payoff of saying yes is visible.
                    const pt = (i, r) => {
                        const ang = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                        return `${(80 + Math.cos(ang) * r).toFixed(1)},${(80 + Math.sin(ang) * r).toFixed(1)}`;
                    };
                    const ring = (r) => [0, 1, 2, 3, 4, 5].map((i) => pt(i, r)).join(' ');
                    const before = [pt(0, 24), pt(1, 22), pt(2, 20), pt(3, 22), pt(4, 20), pt(5, 24)].join(' ');
                    const after = [pt(0, 30), pt(1, 40), pt(2, 52), pt(3, 30), pt(4, 50), pt(5, 46)].join(' ');
                    const labels = ['STR', 'CARDIO', 'CONSIST', 'NUTR', 'RECOV', 'PROG'];
                    return `
                        <div class="bm-brandline">Your living stats</div>
                        <h2 class="bm-title">Every yes makes this graph grow</h2>
                        <p class="bm-subtitle">Your six stats update from what you actually do — wake up on time, hit your steps, sleep well, and watch the shape push outward.</p>
                        <div class="bm-spider-card">
                            <svg viewBox="0 0 160 160" class="bm-spider" aria-label="Your stat radar growing">
                                ${[52, 39, 26, 13].map((r) => `<polygon points="${ring(r)}" class="bm-spider-ring"></polygon>`).join('')}
                                ${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="80" y1="80" x2="${pt(i, 52).split(',')[0]}" y2="${pt(i, 52).split(',')[1]}" class="bm-spider-ring"></line>`).join('')}
                                <polygon points="${before}" class="bm-spider-before"></polygon>
                                <polygon points="${after}" class="bm-spider-after"></polygon>
                                ${labels.map((l, i) => {
                                    const [x, y] = pt(i, 66).split(',');
                                    return `<text x="${x}" y="${y}" class="bm-spider-label" text-anchor="middle">${l}</text>`;
                                }).join('')}
                            </svg>
                            <div class="bm-spider-alarm" aria-hidden="true">
                                <svg viewBox="0 0 48 48"><circle cx="24" cy="26" r="14" fill="none"/><path d="M24 18v8l6 4M10 12l6-5M38 12l-6-5" fill="none"/><path class="bm-alarm-wave" d="M6 20c-2 2-2 6 0 8M42 20c2 2 2 6 0 8" fill="none"/></svg>
                            </div>
                            <span class="bm-spider-chip c1">+ Consistency</span>
                            <span class="bm-spider-chip c2">+ Recovery</span>
                            <span class="bm-spider-chip c3">+ Cardio</span>
                        </div>
                        <p class="bm-copy" style="text-align:center">Wake up when you said you would → points. Steps counted → points. Sleep synced → points. Say yes on the next screens to switch it on.</p>
                        <div class="bm-footer"><button type="button" class="bm-cta" data-bm-next>CONTINUE</button></div>`;
                }
                case 'mealGrid': {
                    const picksArr = Array.isArray(answers[screen.id]) ? answers[screen.id] : [];
                    const minSelect = Math.max(1, Number(screen.minSelect || 2));
                    const data = window.__mpQuizData || null;
                    if (!data) {
                        // Fail open: a dead dataset fetch must never trap the quiz —
                        // the engine auto-picks great meals when picks stay empty.
                        if (window.__mpQuizDataFailed) {
                            return `${head}
                                <p class="bm-hint" style="text-align:center">Couldn’t load the meal photos — we’ll pick great ones for you.</p>
                                <div class="bm-footer"><button type="button" class="bm-cta" data-bm-next>NEXT STEP</button></div>`;
                        }
                        try {
                            window.MealProgramData.load().then((d) => {
                                window.__mpQuizData = d;
                                if (SCREENS[idx] === screen) render(0);
                            }).catch(() => {
                                window.__mpQuizDataFailed = true;
                                if (SCREENS[idx] === screen) render(0);
                            });
                        } catch { window.__mpQuizDataFailed = true; }
                        return `${head}<p class="bm-hint">Loading meals…</p>`;
                    }
                    const goal = ({ 'A few sizes smaller': 'cut', 'Athletic': 'maintain', 'Ripped': 'cut', 'Swole': 'bulk' })[answers.bodyGoal] || 'maintain';
                    const pool = window.MealProgramEngine.slotPool(data.meals, screen.slot, goal, 'no-restrictions', []);
                    const cards = pool.map((meal) => `
                        <button type="button" class="mp-card ${picksArr.includes(meal.id) ? 'selected' : ''}" data-bm-mealpick="${meal.id}" aria-pressed="${picksArr.includes(meal.id)}">
                            <img loading="lazy" alt="${esc(meal.name)}" src="${esc(meal.image_url || '')}" onerror="this.style.visibility='hidden'">
                            <span class="mp-goal-pill">${esc(meal.goal)}</span>
                            <span class="mp-card-body"><span class="mp-card-name">${esc(meal.name)}</span>
                            <span class="mp-card-meta">${Number(meal.calories)} kcal · ${Number(meal.protein_g)}g protein</span></span>
                        </button>`).join('');
                    return `${head}
                        <p class="bm-hint" data-bm-pickhint>Pick at least ${minSelect} · ${picksArr.length} picked</p>
                        <div class="mp-grid bm-mealgrid">${cards}</div>
                        <div class="bm-footer bm-footer-split">
                            <button type="button" class="bm-cta is-ghost" data-bm-surprise>SURPRISE ME</button>
                            <button type="button" class="bm-cta ${picksArr.length >= minSelect ? '' : 'is-disabled'}" data-bm-next>NEXT STEP</button>
                        </div>`;
                }
                case 'stateSelect': {
                    const data = window.__mpQuizData || null;
                    if (!data) {
                        if (window.__mpQuizDataFailed) {
                            return `${head}
                                <p class="bm-hint" style="text-align:center">We’ll price your groceries with national averages.</p>
                                <div class="bm-footer"><button type="button" class="bm-cta" data-bm-next>NEXT STEP</button></div>`;
                        }
                        try {
                            window.MealProgramData.load().then((d) => {
                                window.__mpQuizData = d;
                                if (SCREENS[idx] === screen) render(0);
                            }).catch(() => {
                                window.__mpQuizDataFailed = true;
                                if (SCREENS[idx] === screen) render(0);
                            });
                        } catch { window.__mpQuizDataFailed = true; }
                        return `${head}<p class="bm-hint">Loading…</p>`;
                    }
                    const states = data.location_multipliers.states;
                    if (!answers.mealState) answers.mealState = 'GA';
                    return `${head}
                        <div class="bm-bigfields"><label class="bm-bigfield is-wide">
                            <select data-bm-state class="bm-state-select">
                                ${Object.keys(states).sort().map((code) => `<option value="${code}" ${answers.mealState === code ? 'selected' : ''}>${esc(states[code].name)} (${code})</option>`).join('')}
                            </select></label></div>
                        <div class="bm-footer"><button type="button" class="bm-cta" data-bm-next>NEXT STEP</button></div>`;
                }
                case 'time':
                    if (!answers.wakeTime) answers.wakeTime = '07:00';
                    return `${head}
                        <div class="bm-bigfields">
                            <label class="bm-bigfield is-wide bm-timefield"><input type="time" value="${esc(answers.wakeTime || '07:00')}" data-bm-field="wakeTime"></label>
                        </div>
                        <div class="bm-banner is-ok"><strong>Why we ask</strong><p>Check in within an hour of this time and your Consistency stat ticks up. Miss it and nothing bad happens — you just leave points on the table.</p></div>
                        <div class="bm-footer"><button type="button" class="bm-cta" data-bm-next>NEXT STEP</button></div>`;
                case 'info':
                    return `
                        <div class="bm-brandline">${esc(screen.kicker || 'RiseForIt')}</div>
                        <h2 class="bm-title">${esc(resolve(screen.title, answers))}</h2>
                        ${String(resolve(screen.body, answers) || '').split('\n').map((p) => `<p class="bm-copy">${esc(p)}</p>`).join('')}
                        ${infoArt(screen.art)}
                        <div class="bm-footer"><button type="button" class="bm-cta" data-bm-next>CONTINUE</button></div>`;
                case 'height': {
                    const unit = answers.heightUnit || 'ft';
                    return `${head}
                        <div class="bm-unit-toggle" role="tablist">
                            <button type="button" class="${unit === 'ft' ? 'is-active' : ''}" data-bm-unit="ft">ft</button>
                            <button type="button" class="${unit === 'cm' ? 'is-active' : ''}" data-bm-unit="cm">cm</button>
                        </div>
                        ${unit === 'ft' ? `
                            <div class="bm-bigfields">
                                <label class="bm-bigfield"><input type="number" inputmode="numeric" min="3" max="7" placeholder="Height" value="${esc(answers.heightFt || '')}" data-bm-field="heightFt"><span>ft</span></label>
                                <label class="bm-bigfield"><input type="number" inputmode="numeric" min="0" max="11" placeholder="Height" value="${esc(answers.heightIn || '')}" data-bm-field="heightIn"><span>in</span></label>
                            </div>` : `
                            <div class="bm-bigfields">
                                <label class="bm-bigfield is-wide"><input type="number" inputmode="numeric" min="120" max="230" placeholder="Height" value="${esc(answers.heightCm || '')}" data-bm-field="heightCm"><span>cm</span></label>
                            </div>`}
                        <div class="bm-footer"><button type="button" class="bm-cta ${heightInches(answers) ? '' : 'is-disabled'}" data-bm-next>NEXT STEP</button></div>`;
                }
                case 'weight':
                case 'goalWeight': {
                    const isGoal = screen.type === 'goalWeight';
                    const unitKey = isGoal ? 'goalWeightUnit' : 'weightUnit';
                    const valKey = isGoal ? 'goalWeightValue' : 'weightValue';
                    const unit = answers[unitKey] || 'lbs';
                    const v = bmi(answers);
                    let banner = '';
                    if (!isGoal && weightLb(answers) && v) {
                        const cls = bmiClass(v);
                        const tone = (cls === 'Obese' || cls === 'Underweight') ? 'is-warn' : 'is-ok';
                        banner = `<div class="bm-banner ${tone}"><strong>Your BMI is ${v.toFixed(1)}, which is considered ${cls.toLowerCase()}</strong><p>We'll use your BMI to tune training volume and calories so the plan actually fits you.</p></div>`;
                    }
                    if (isGoal && weightLb(answers) && goalWeightLb(answers)) {
                        const now = weightLb(answers);
                        const goal = goalWeightLb(answers);
                        const pct = Math.abs(Math.round(((now - goal) / now) * 100));
                        banner = now > goal
                            ? `<div class="bm-banner is-ok"><strong>Unlock health benefits: lose ${pct}% of your weight</strong><p>Studies show losing 10%+ of body weight can reduce the risk of several obesity-related conditions.</p></div>`
                            : `<div class="bm-banner is-ok"><strong>Lean gain: +${pct}% bodyweight</strong><p>We'll pace muscle gain so it stays lean — strength up, waist steady.</p></div>`;
                    }
                    return `${head}
                        <div class="bm-unit-toggle" role="tablist">
                            <button type="button" class="${unit === 'lbs' ? 'is-active' : ''}" data-bm-unit="lbs">lbs</button>
                            <button type="button" class="${unit === 'kg' ? 'is-active' : ''}" data-bm-unit="kg">kg</button>
                        </div>
                        <div class="bm-bigfields">
                            <label class="bm-bigfield is-wide"><input type="number" inputmode="decimal" min="55" max="700" placeholder="${isGoal ? 'Goal weight' : 'Your weight'}" value="${esc(answers[valKey] || '')}" data-bm-field="${valKey}"><span>${esc(unit)}</span></label>
                        </div>
                        ${banner}
                        <div class="bm-footer"><button type="button" class="bm-cta ${(isGoal ? goalWeightLb(answers) : weightLb(answers)) ? '' : 'is-disabled'}" data-bm-next>NEXT STEP</button></div>`;
                }
                case 'age':
                    return `${head}
                        <div class="bm-bigfields">
                            <label class="bm-bigfield is-wide"><input type="number" inputmode="numeric" min="16" max="100" placeholder="Your age" value="${esc(answers.ageYears || '')}" data-bm-field="ageYears"><span>years</span></label>
                        </div>
                        <div class="bm-banner is-ok"><strong>We ask your age to personalize your plan</strong><p>Recovery, volume and calories all shift with age — the plan adjusts for it.</p></div>
                        <div class="bm-footer"><button type="button" class="bm-cta ${Number(answers.ageYears) >= 16 ? '' : 'is-disabled'}" data-bm-next>NEXT STEP</button></div>`;
                case 'date': {
                    const min = new Date(); min.setDate(min.getDate() + 7);
                    return `${head}
                        <label class="bm-datefield">
                            <span>Select date</span>
                            <input type="date" min="${min.toISOString().slice(0, 10)}" value="${esc(answers.eventDate || '')}" data-bm-field="eventDate">
                        </label>
                        <div class="bm-footer">
                            <button type="button" class="bm-cta ${answers.eventDate ? '' : 'is-disabled'}" data-bm-next>CONTINUE</button>
                            <button type="button" class="bm-skip" data-bm-skip>SKIP THIS STEP</button>
                        </div>`;
                }
                case 'bmi': {
                    const v = bmi(answers) || 25;
                    const pos = clamp(((v - 15) / (40 - 15)) * 100, 2, 98);
                    const cls = bmiClass(v);
                    const risky = cls === 'Obese' || cls === 'Overweight';
                    const bodyType = { 'Slender': 'Ectomorph', 'Medium build': 'Mesomorph', 'Stocky': 'Mesomorph', 'Significantly overweight': 'Endomorph' }[answers.build] || 'Mesomorph';
                    const lifestyle = { 'I spend most of the day sitting': 'Sedentary', 'I take active breaks': 'Lightly active', "I'm on my feet all day long": 'Active' }[answers.dailyActivity] || 'Moderate';
                    const fitness = { 'Never': 'Basic', 'Several times a month': 'Basic', 'Several times a week': 'Intermediate', 'Almost every day': 'Advanced' }[answers.exerciseFreq] || 'Basic';
                    const metabolism = { 'I gain weight fast but lose it slowly': 'Moderate, challenging to stay trim', 'I gain and lose weight easily': 'Fast and responsive', 'I struggle to gain weight or muscle': 'Fast, hard to gain' }[answers.weightChange] || 'Moderate';
                    return `
                        <h2 class="bm-title">Here's your wellness profile</h2>
                        <div class="bm-bmi-card">
                            <div class="bm-bmi-head">Body Mass Index (BMI)</div>
                            <div class="bm-bmi-scale">
                                <div class="bm-bmi-you" style="left:${pos}%"><span>You — ${v.toFixed(2)}</span></div>
                                <div class="bm-bmi-bar"></div>
                                <div class="bm-bmi-ticks"><span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span></div>
                                <div class="bm-bmi-zones"><span>UNDERWEIGHT</span><span>NORMAL</span><span>OVERWEIGHT</span><span>OBESE</span></div>
                            </div>
                            ${risky ? `<div class="bm-banner is-warn"><strong>Risks of unhealthy BMI:</strong><p>High blood pressure, increased risk of heart attack, stroke, type 2 diabetes, chronic back and joint pain.</p></div>`
                                : `<div class="bm-banner is-ok"><strong>Solid base to build on.</strong><p>Your BMI sits in a healthy range — we'll focus on strength, shape and consistency.</p></div>`}
                            <div class="bm-bmi-rows">
                                <div class="bm-bmi-row"><span>Body type</span><strong>${esc(bodyType)}</strong></div>
                                <div class="bm-bmi-row"><span>Lifestyle</span><strong>${esc(lifestyle)}</strong></div>
                                <div class="bm-bmi-row"><span>Fitness level</span><strong>${esc(fitness)}</strong></div>
                                <div class="bm-bmi-row"><span>Metabolism</span><strong>${esc(metabolism)}</strong></div>
                            </div>
                        </div>
                        <div class="bm-footer"><button type="button" class="bm-cta" data-bm-next>CONTINUE</button></div>`;
                }
                case 'projection': {
                    const d = goalDate(answers);
                    const nowW = Math.round(weightLb(answers) || 200);
                    const goalW = Math.round(goalWeightLb(answers) || nowW - 20);
                    const losing = nowW >= goalW;
                    return `
                        <h2 class="bm-title">The plan that will finally get you in shape</h2>
                        <p class="bm-subtitle">We estimate you could be <strong>${goalW} lbs</strong> by <strong>${fmtDate(d)}</strong>*</p>
                        <div class="bm-graph-card">
                            <svg viewBox="0 0 320 170" class="bm-graph" aria-label="Projected weight curve">
                                <defs>
                                    <linearGradient id="bm-curve" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stop-color="#e2574c"></stop>
                                        <stop offset="45%" stop-color="#e7a34d"></stop>
                                        <stop offset="100%" stop-color="#3fae5a"></stop>
                                    </linearGradient>
                                    <linearGradient id="bm-fill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stop-color="rgba(226,87,76,0.18)"></stop>
                                        <stop offset="100%" stop-color="rgba(63,174,90,0.02)"></stop>
                                    </linearGradient>
                                </defs>
                                ${[0, 1, 2, 3].map((i) => `<line x1="16" x2="304" y1="${30 + i * 36}" y2="${30 + i * 36}" class="bm-graph-grid"></line>`).join('')}
                                <path class="bm-graph-area" fill="url(#bm-fill)" d="M16 ${losing ? 30 : 138} C 90 ${losing ? 34 : 132}, 120 ${losing ? 96 : 72}, 190 ${losing ? 118 : 52} C 240 ${losing ? 132 : 40}, 270 ${losing ? 138 : 34}, 304 ${losing ? 138 : 30} L 304 166 L 16 166 Z"></path>
                                <path class="bm-graph-line" stroke="url(#bm-curve)" d="M16 ${losing ? 30 : 138} C 90 ${losing ? 34 : 132}, 120 ${losing ? 96 : 72}, 190 ${losing ? 118 : 52} C 240 ${losing ? 132 : 40}, 270 ${losing ? 138 : 34}, 304 ${losing ? 138 : 30}"></path>
                                <circle cx="16" cy="${losing ? 30 : 138}" r="5" class="bm-graph-dot"></circle>
                                <circle cx="304" cy="${losing ? 138 : 30}" r="6" class="bm-graph-dot is-goal"></circle>
                                <text x="20" y="${losing ? 22 : 158}" class="bm-graph-text">${nowW}</text>
                            </svg>
                            <div class="bm-graph-goal" style="${losing ? 'right:6px;bottom:44px' : 'right:6px;top:6px'}">Goal<br><strong>${goalW} lbs</strong></div>
                        </div>
                        <p class="bm-finePrint">* Based on users who log their progress. Following the exercise and meal plan greatly impacts results. The chart is a non-customized illustration; results may vary.</p>
                        <div class="bm-footer"><button type="button" class="bm-cta" data-bm-next>CONTINUE</button></div>`;
                }
                case 'loading':
                    return `
                        <div class="bm-loading">
                            <div class="bm-loading-ring">
                                <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="bm-ring-track"></circle><circle cx="60" cy="60" r="52" class="bm-ring-fill" data-bm-ring></circle></svg>
                                <div class="bm-loading-pct"><span data-bm-pct>0</span>%</div>
                            </div>
                            <p class="bm-loading-label">Creating your personalized plan…</p>
                        </div>
                        <div class="bm-divider"></div>
                        <h3 class="bm-loading-social">Built for people like you</h3>
                        <div class="bm-quote-card">
                            <div class="bm-stars">★★★★★</div>
                            <strong>“It's like having a coach, a meal planner and a grocery list in one.”</strong>
                            <p>Workouts, meals and restock alerts all talk to each other. I stopped juggling four apps.</p>
                        </div>
                        <p class="bm-finePrint">*Disclaimer: following the exercise and meal plan is the key to your results. Individual results may vary.</p>`;
                case 'plan': {
                    const mapped = mapAnswers(answers);
                    const nowW = Math.round(weightLb(answers) || 0);
                    const goalW = Math.round(goalWeightLb(answers) || 0);
                    const losing = nowW >= goalW;
                    const v = bmi(answers);
                    const fatNow = v ? (v >= 30 ? 'High' : v >= 25 ? 'Elevated' : 'Moderate') : 'Moderate';
                    return `
                        <div class="bm-compare">
                            <div class="bm-compare-col">
                                <div class="bm-compare-tag">Now</div>
                                ${torso(answers.build === 'Significantly overweight' ? 32 : answers.build === 'Stocky' ? 27 : 22, false, 31)}
                                <div class="bm-compare-meta"><span>Body fat</span><strong>${esc(fatNow)}</strong></div>
                                <div class="bm-compare-meta"><span>Fitness level</span><strong>Beginner</strong></div>
                                <div class="bm-meter"><span style="width:33%"></span></div>
                            </div>
                            <div class="bm-compare-arrow">→</div>
                            <div class="bm-compare-col">
                                <div class="bm-compare-tag is-goal">Your goal</div>
                                ${torso(19, true, 33)}
                                <div class="bm-compare-meta"><span>Body fat</span><strong>${losing ? 'Lean' : 'Athletic'}</strong></div>
                                <div class="bm-compare-meta"><span>Fitness level</span><strong>Advanced</strong></div>
                                <div class="bm-meter"><span style="width:92%"></span></div>
                            </div>
                        </div>
                        <h2 class="bm-title">Your personalized plan is ready!</h2>
                        <div class="bm-plan-chips">
                            <div class="bm-plan-chip"><span>Goal</span><strong>${esc(mapped.goal)}</strong></div>
                            ${goalW ? `<div class="bm-plan-chip"><span>Target weight</span><strong>${goalW} lbs</strong></div>` : ''}
                        </div>
                        <div class="bm-free-card">
                            <div class="bm-free-badge">100% FREE</div>
                            <strong>No card. No trial. No catch.</strong>
                            <p>Your full plan — workouts, meals and grocery list — is included with your RiseForIt account.</p>
                        </div>
                        <div class="bm-footer">
                            <button type="button" class="bm-cta is-big" data-finish-action="client-overview">GET MY FREE PLAN</button>
                        </div>
                        <h3 class="bm-plan-sub">Highlights of your plan</h3>
                        <div class="bm-highlights">
                            <div class="bm-highlight"><strong>${esc(mapped.timePerSession)} min workouts</strong><span>matched to your ${esc(mapped.daysPerWeek)} training days a week</span></div>
                            <div class="bm-highlight"><strong>${esc(answers.equipmentQ && answers.equipmentQ.length ? answers.equipmentQ[0] : 'Bodyweight')}-friendly exercises</strong><span>built for the equipment you actually have</span></div>
                            <div class="bm-highlight"><strong>Personalized meal plan</strong><span>with quick recipes and a grocery list that restocks itself</span></div>
                            <div class="bm-highlight"><strong>Macro & calorie targets</strong><span>calculated for your goal — no math needed</span></div>
                            <div class="bm-highlight"><strong>Rank & progress tracking</strong><span>watch your six stats climb the pyramid as you train</span></div>
                        </div>
                        <div class="bm-faq">
                            <h3 class="bm-plan-sub">People often ask</h3>
                            <details><summary>What happens after I get my plan?</summary><p>You land on your Overview page with your stats, today's workout, your meal plan and your grocery list ready to go.</p></details>
                            <details><summary>Do I need any fitness equipment?</summary><p>No — your plan is built around the equipment you told us you have, down to bodyweight-only.</p></details>
                            <details><summary>Is it really free?</summary><p>Yes. The full plan is part of your RiseForIt account. No card required.</p></details>
                        </div>
                        <div class="bm-footer">
                            <button type="button" class="bm-cta is-big" data-finish-action="client-overview">GET MY FREE PLAN</button>
                        </div>
                        <p class="bm-finePrint">*Disclaimer: following the exercise and meal plan is key to your results. Individual results may vary. Consult a physician first.</p>`;
                }
                default:
                    return head;
            }
        }

        function render(dir = 1) {
            const screen = SCREENS[idx];
            root.innerHTML = `
                ${topBar(screen)}
                <div class="bm-screen ${reduceMotion ? '' : (dir >= 0 ? 'is-entering' : 'is-entering-back')}" data-bm-screen="${esc(screen.id)}">
                    ${screenBody(screen)}
                </div>`;
            if (screen.type === 'loading') startLoading();
            if (screen.type === 'plan') {
                writeIdentityProfile();
                if (typeof opts.onQuizComplete === 'function') {
                    // All answers are in: hand the mapped intake + stats up before the CTA.
                    opts.onQuizComplete({ fields: mapAnswers(answers), stats: computeStats(answers), raw: answers });
                }
            }
            root.scrollTop = 0;
            window.scrollTo({ top: 0, behavior: 'auto' });
        }

        /* Contract with the stat engine: onboarding captures the raw answers
           + the >=2 pillar goal ids under 'ode_identity_profile_v1'. Stat
           derivation lives in js/identity-engine.js — this module must never
           write ovIdentityStats/ovIdentityStatsPrev. Written at loading time
           (all questions answered) so the engine can seed before the finale,
           and re-written at the plan screen for redo runs. */
        function writeIdentityProfile() {
            try {
                localStorage.setItem('ode_identity_profile_v1', JSON.stringify({
                    version: 1,
                    goals: Array.isArray(answers.pillarGoals) ? answers.pillarGoals.slice() : [],
                    answers: JSON.parse(JSON.stringify(answers)),
                    completedAt: Date.now()
                }));
            } catch {}
            sendOnboardingInsights();
            sendScoringProfile();
        }

        let scoringProfileSent = false;
        function sendScoringProfile() {
            // The "Make your scores fair" data (sex + age) is asked right here
            // in onboarding, so save it now and suppress the post-onboarding
            // popup that used to interrupt the intro cutscene.
            if (scoringProfileSent) return;
            scoringProfileSent = true;
            try {
                const sex = answers.gender === 'Female' ? 'female'
                    : answers.gender === 'Male' ? 'male' : null;
                const age = Number(answers.ageYears);
                let dob = null;
                if (Number.isFinite(age) && age >= 13 && age <= 120) {
                    dob = `${new Date().getFullYear() - age}-01-01`;
                }
                if (!sex && !dob) return;
                // Kill the modal locally too, so it can't flash before the POST lands.
                try { localStorage.setItem('ode_scoring_profile_prompt_v1', 'done'); } catch {}
                let tz = null;
                try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch {}
                fetch('/api/training/scoring-profile', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sex, dob, timezone: tz })
                }).catch(() => {});
            } catch {}
        }

        let insightsSent = false;
        function sendOnboardingInsights() {
            // Owner analytics: why this client joined. Fire-and-forget; the
            // quiz never blocks on it.
            if (insightsSent) return;
            insightsSent = true;
            try {
                fetch('/api/training/onboarding-insights', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        role: 'client',
                        source: answers.sourceHeard || '',
                        expectedFeature: answers.expectedFeature || '',
                        results: [answers.mainReason, answers.bodyGoal].filter(Boolean)
                    })
                }).catch(() => {});
            } catch {}
        }

        function startLoading() {
            writeIdentityProfile();
            const ring = root.querySelector('[data-bm-ring]');
            const pctEl = root.querySelector('[data-bm-pct]');
            const CIRC = 2 * Math.PI * 52;
            if (ring) { ring.style.strokeDasharray = String(CIRC); ring.style.strokeDashoffset = String(CIRC); }
            let pct = 0;
            const started = performance.now();
            const DURATION = reduceMotion ? 400 : 3400;
            loadingTimer = window.setInterval(() => {
                const t = clamp((performance.now() - started) / DURATION, 0, 1);
                pct = Math.round(t * 100);
                if (pctEl) pctEl.textContent = String(pct);
                if (ring) ring.style.strokeDashoffset = String(CIRC * (1 - t));
                if (t >= 1) {
                    window.clearInterval(loadingTimer);
                    loadingTimer = 0;
                    const stats = computeStats(answers);
                    if (typeof opts.onLoadingDone === 'function') {
                        // Let the host run the rank finale, then bring up the plan.
                        opts.onLoadingDone(stats, () => go(idx + 1));
                    } else {
                        go(idx + 1);
                    }
                }
            }, reduceMotion ? 100 : 40);
        }

        root.addEventListener('click', (event) => {
            // Element, not HTMLElement: taps often land on the SVG art inside
            // a card, and SVGElement is not an HTMLElement — those taps were
            // silently dropped (real phone bug, caught by the E2E walker).
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;
            const screen = SCREENS[idx];

            if (target.closest('[data-bm-back]')) { go(idx - 1, -1); return; }
            if (target.closest('[data-bm-skip]')) { answers[screen.id] = ''; go(idx + 1); return; }

            const unitBtn = target.closest('[data-bm-unit]');
            if (unitBtn) {
                const unit = unitBtn.getAttribute('data-bm-unit');
                if (screen.type === 'height') answers.heightUnit = unit;
                if (screen.type === 'weight') answers.weightUnit = unit;
                if (screen.type === 'goalWeight') answers.goalWeightUnit = unit;
                persist(); render(1); return;
            }

            const choiceBtn = target.closest('[data-bm-choice]');
            if (choiceBtn) {
                // Disabled options (e.g. "Coming soon") never select or advance.
                if (choiceBtn.disabled || choiceBtn.classList.contains('is-disabled')) return;
                const value = choiceBtn.getAttribute('data-bm-choice');
                choiceBtn.classList.add('is-selected');
                window.setTimeout(() => answerAndAdvance(screen, value), reduceMotion ? 0 : 180);
                return;
            }

            const scaleBtn = target.closest('[data-bm-scale]');
            if (scaleBtn) {
                scaleBtn.classList.add('is-selected');
                window.setTimeout(() => answerAndAdvance(screen, Number(scaleBtn.getAttribute('data-bm-scale'))), reduceMotion ? 0 : 180);
                return;
            }

            const multiBtn = target.closest('[data-bm-multi]');
            if (multiBtn) {
                const value = multiBtn.getAttribute('data-bm-multi');
                let arr = Array.isArray(answers[screen.id]) ? answers[screen.id].slice() : [];
                const noneLabels = ['None of the above', 'No events any time soon'];
                if (noneLabels.includes(value)) {
                    arr = arr.includes(value) ? [] : [value];
                } else {
                    arr = arr.filter((v) => !noneLabels.includes(v));
                    arr = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
                }
                answers[screen.id] = arr;
                persist();
                multiBtn.classList.toggle('is-selected', arr.includes(value));
                root.querySelectorAll('[data-bm-multi]').forEach((el) => {
                    el.classList.toggle('is-selected', arr.includes(el.getAttribute('data-bm-multi')));
                });
                const cta = root.querySelector('[data-bm-next]');
                if (cta) cta.classList.toggle('is-disabled', arr.length < Math.max(1, Number(screen.minSelect || 1)));
                return;
            }

            const mealBtn = target.closest('[data-bm-mealpick]');
            if (mealBtn && screen.type === 'mealGrid') {
                const mealId = Number(mealBtn.getAttribute('data-bm-mealpick'));
                let arr = Array.isArray(answers[screen.id]) ? answers[screen.id].slice() : [];
                if (arr.includes(mealId)) arr = arr.filter((v) => v !== mealId);
                else if (arr.length < 8) arr = [...arr, mealId];
                answers[screen.id] = arr;
                persist();
                mealBtn.classList.toggle('selected', arr.includes(mealId));
                mealBtn.setAttribute('aria-pressed', String(arr.includes(mealId)));
                const minSelect = Math.max(1, Number(screen.minSelect || 2));
                const hint = root.querySelector('[data-bm-pickhint]');
                if (hint) hint.textContent = `Pick at least ${minSelect} · ${arr.length} picked`;
                const cta = root.querySelector('[data-bm-next]');
                if (cta) cta.classList.toggle('is-disabled', arr.length < minSelect);
                return;
            }

            const surpriseBtn = target.closest('[data-bm-surprise]');
            if (surpriseBtn && screen.type === 'mealGrid' && window.MealProgramEngine && window.__mpQuizData) {
                const goal = ({ 'A few sizes smaller': 'cut', 'Athletic': 'maintain', 'Ripped': 'cut', 'Swole': 'bulk' })[answers.bodyGoal] || 'maintain';
                const ids = window.MealProgramEngine.surprisePicks(window.__mpQuizData.meals, screen.slot, goal, 'no-restrictions', []);
                let arr = Array.isArray(answers[screen.id]) ? answers[screen.id].slice() : [];
                ids.forEach((mealId) => { if (!arr.includes(mealId) && arr.length < 8) arr.push(mealId); });
                answers[screen.id] = arr;
                persist();
                root.querySelectorAll('[data-bm-mealpick]').forEach((el) => {
                    const on = arr.includes(Number(el.getAttribute('data-bm-mealpick')));
                    el.classList.toggle('selected', on);
                    el.setAttribute('aria-pressed', String(on));
                });
                const minSelect = Math.max(1, Number(screen.minSelect || 2));
                const hint = root.querySelector('[data-bm-pickhint]');
                if (hint) hint.textContent = `Pick at least ${minSelect} · ${arr.length} picked`;
                const cta = root.querySelector('[data-bm-next]');
                if (cta) cta.classList.toggle('is-disabled', arr.length < minSelect);
                return;
            }

            const nextBtn = target.closest('[data-bm-next]');
            if (nextBtn && !nextBtn.classList.contains('is-disabled')) {
                answers[`${screen.id}Seen`] = true;
                const card = root.querySelector('.bm-screen');
                if (card && !reduceMotion) {
                    card.classList.add('is-leaving');
                    window.setTimeout(() => go(idx + 1), 220);
                } else {
                    go(idx + 1);
                }
                return;
            }
        });

        // Meal Program (Part 2): state dropdown on the stateSelect screen.
        root.addEventListener('change', (event) => {
            const sel = event.target;
            if (sel instanceof HTMLSelectElement && sel.hasAttribute('data-bm-state')) {
                answers.mealState = sel.value;
                persist();
            }
        });

        root.addEventListener('input', (event) => {
            const input = event.target;
            if (!(input instanceof HTMLInputElement)) return;
            const field = input.getAttribute('data-bm-field');
            if (!field) return;
            answers[field] = input.value;
            persist();
            const screen = SCREENS[idx];
            // Re-evaluate the CTA + live banners without stealing focus.
            const cta = root.querySelector('[data-bm-next]');
            const valid = screen.type === 'height' ? Boolean(heightInches(answers))
                : screen.type === 'weight' ? Boolean(weightLb(answers))
                : screen.type === 'goalWeight' ? Boolean(goalWeightLb(answers))
                : screen.type === 'age' ? Number(answers.ageYears) >= 16
                : screen.type === 'date' ? Boolean(answers.eventDate)
                : true;
            if (cta) cta.classList.toggle('is-disabled', !valid);
            if ((screen.type === 'weight' || screen.type === 'goalWeight') && valid) {
                // Refresh the banner text only.
                const existing = root.querySelector('.bm-banner');
                const html = screenBody(screen);
                const tmp = document.createElement('div');
                tmp.innerHTML = html;
                const fresh = tmp.querySelector('.bm-banner');
                if (fresh && existing) existing.outerHTML = fresh.outerHTML;
                else if (fresh && !existing) cta?.parentElement?.insertAdjacentHTML('beforebegin', fresh.outerHTML);
            }
        });

        render(1);

        return {
            destroy() {
                if (loadingTimer) window.clearInterval(loadingTimer);
                document.body.classList.remove('client-quiz-active');
                root.remove();
            },
            get answers() { return answers; },
            mapAnswers: () => mapAnswers(answers),
            computeStats: () => computeStats(answers)
        };
    }

    window.OdeClientQuiz = { mount, mapAnswers, computeStats, SCREENS };
})();
