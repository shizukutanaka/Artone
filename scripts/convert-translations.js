const fs = require('fs');
const path = require('path');

// Read the translation file
const translationsPath = path.join(__dirname, 'src', 'i18n', 'translations.ts');
const messagesDir = path.join(__dirname, 'src', 'messages');

if (!fs.existsSync(translationsPath)) {
  console.error('Translation file not found:', translationsPath);
  process.exit(1);
}

// Create messages directory if it doesn't exist
if (!fs.existsSync(messagesDir)) {
  fs.mkdirSync(messagesDir, { recursive: true });
}

console.log('Reading translation file...');
const content = fs.readFileSync(translationsPath, 'utf8');

// Extract language codes and their translations
const langRegex = /'([a-z]+-[A-Z]+)':\s*\{([\s\S]*?)\n\s*\},?/g;
const matches = [];
let match;

while ((match = langRegex.exec(content)) !== null) {
  const [, langCode, langContent] = match;

  // Extract individual translations
  const translations = {};
  const keyRegex = /'([^']+)':\s*['"]([^'"]*)['"]/g;
  let keyMatch;

  while ((keyMatch = keyRegex.exec(langContent)) !== null) {
    const [, key, value] = keyMatch;
    translations[key] = value;
  }

  // Handle pluralization
  const pluralRegex = /'([^']+\.count)':\s*\{([\s\S]*?)\n\s*\}/g;
  let pluralMatch;

  while ((pluralMatch = pluralRegex.exec(langContent)) !== null) {
    const [, key, pluralContent] = pluralMatch;

    // Extract plural forms
    const pluralForms = {};
    const formRegex = /(\d+|one|two|few|many|other):\s*['"]([^'"]*)['"]/g;
    let formMatch;

    while ((formMatch = formRegex.exec(pluralContent)) !== null) {
      const [, form, value] = formMatch;
      pluralForms[form] = value;
    }

    translations[key] = pluralForms;
  }

  if (Object.keys(translations).length > 0) {
    matches.push({ langCode, translations });
  }
}

console.log(`Found ${matches.length} languages:`);
matches.forEach(({ langCode }) => console.log(`  - ${langCode}`));

// Generate JSON files for each language
matches.forEach(({ langCode, translations }) => {
  const fileName = `${langCode}.json`;
  const filePath = path.join(messagesDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(translations, null, 2));
  console.log(`Generated: ${fileName} (${Object.keys(translations).length} keys)`);
});

console.log('\nTranslation conversion completed!');
console.log(`Total languages processed: ${matches.length}`);
console.log(`Output directory: ${messagesDir}`);
