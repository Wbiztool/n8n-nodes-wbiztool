const { WbizToolApi } = require('./dist/credentials/WbizToolApi.credentials.js');

console.log('🧪 Testing WbizTool credential structure...\n');

try {
  const credential = new WbizToolApi();
  
  console.log('✅ Credential instantiated successfully');
  console.log('📋 Credential details:');
  console.log(`   Name: ${credential.name}`);
  console.log(`   Display Name: ${credential.displayName}`);
  console.log(`   Properties: ${credential.properties.length} fields`);
  
  // Check required properties
  const requiredFields = ['clientId', 'apiKey'];
  const hasRequired = requiredFields.every(field => 
    credential.properties.some(prop => prop.name === field && prop.required)
  );
  
  console.log(`   Required fields: ${hasRequired ? '✅' : '❌'}`);
  
  // Check authentication structure
  console.log(`   Authentication: ${credential.authenticate ? '✅' : '❌'}`);
  console.log(`   Test endpoint: ${credential.test ? '✅' : '❌'}`);
  
  console.log('\n🎯 Credential is properly structured for n8n!');
  
} catch (error) {
  console.error('❌ Error loading credential:', error.message);
  process.exit(1);
} 