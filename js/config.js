// ============================================================
// App Configuration
// Edit these values to configure the app for your org
// ============================================================

const APP_CONFIG = {

    // Google Sheet CSV URL (for reading reports)
    SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSxUkbebLtZ0ZnoDhafM7WWnshf5KGjZoFshrAlzsOSEJKWFM2PzIkJVXilTYbzM4ZBtlsM-9UlCft9/pub?gid=1731838810&single=true&output=csv',

    // Google Apps Script URL (for writing new reports to Sheet)
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbw9rvRiqlfsdQh97_M_NeR2q3NwkptautmGdCZsThUxhyx2O-rajWiZUBW4AKr96c0v/exec',

    // Shared password for uploading reports
    // Change this to something your org will use
    UPLOAD_PASSWORD: 'cryptohub2025',

    // How many days before a report loses its "New" badge
    NEW_BADGE_DAYS: 7,

    // App display name
    APP_NAME: 'Crypto Reports Hub',

    // Categories shown as filter chips
    // Edit to match your org's preferred taxonomy
    CATEGORIES: [
        'All',
        'Bitcoin',
        'Ethereum',
        'DeFi',
        'L2s',
        'Macro',
        'Regulation',
        'Annual Report',
        'Analytics',
        'Infrastructure',
        'NFTs',
    ]
};

window.APP_CONFIG = APP_CONFIG;
