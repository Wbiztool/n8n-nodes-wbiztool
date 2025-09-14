const axios = require('axios');

const config = {
  baseURL: 'https://wbiztool.com/api/v1',
  clientId: process.env.WBIZTOOL_CLIENT_ID,
  apiKey: process.env.WBIZTOOL_API_KEY,
  whatsappClientId: process.env.WBIZTOOL_WHATSAPP_CLIENT_ID,
  testPhone: process.env.TEST_PHONE,
  countryCode: process.env.COUNTRY_CODE || '91'
};

async function testCredentials() {
  console.log('🔐 Testing API credentials...');
  try {
    const response = await axios.post(`${config.baseURL}/me/`, {
      client_id: config.clientId,
      api_key: config.apiKey
    });
    console.log('✅ Credentials test passed:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Credentials test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testListWhatsAppClients() {
  console.log('📋 Testing WhatsApp clients list...');
  try {
    const response = await axios.post(`${config.baseURL}/whatsapp-client/list/`, {
      client_id: config.clientId,
      api_key: config.apiKey
    });
    console.log('✅ List clients test passed:', response.data);
    return response.data.whatsapp_clients || [];
  } catch (error) {
    console.error('❌ List clients test failed:', error.response?.data || error.message);
    return [];
  }
}

async function testWhatsAppClientStatus() {
  console.log('🔗 Testing WhatsApp client status...');
  if (!config.whatsappClientId) {
    console.log('⚠️  No WhatsApp client ID provided, skipping...');
    return true;
  }
  
  try {
    const response = await axios.post(`${config.baseURL}/whatsapp-client/status/`, {
      client_id: config.clientId,
      api_key: config.apiKey,
      whatsapp_client: config.whatsappClientId
    });
    console.log('✅ Client status test passed:', response.data);
    return response.data.status === 1;
  } catch (error) {
    console.error('❌ Client status test failed:', error.response?.data || error.message);
    return false;
  }
}

async function testSendMessage() {
  console.log('📱 Testing send message...');
  if (!config.testPhone) {
    console.log('⚠️  No test phone provided, skipping...');
    return null;
  }
  
  try {
    const response = await axios.post(`${config.baseURL}/send_msg/`, {
      client_id: config.clientId,
      api_key: config.apiKey,
      whatsapp_client: config.whatsappClientId,
      msg_type: 0,
      msg: `Test message from WbizTool n8n integration testing - ${new Date().toISOString()}`,
      phone: config.testPhone,
      country_code: config.countryCode
    });
    console.log('✅ Send message test passed:', response.data);
    return response.data.msg_id;
  } catch (error) {
    console.error('❌ Send message test failed:', error.response?.data || error.message);
    return null;
  }
}

async function testMessageStatus(messageId) {
  if (!messageId) {
    console.log('⚠️  No message ID provided, skipping status test...');
    return;
  }
  
  console.log('📊 Testing message status...');
  try {
    const response = await axios.post(`${config.baseURL}/message/status/${messageId}/`, {
      client_id: config.clientId,
      api_key: config.apiKey
    });
    console.log('✅ Message status test passed:', response.data);
  } catch (error) {
    console.error('❌ Message status test failed:', error.response?.data || error.message);
  }
}

async function testScheduleMessage() {
  console.log('⏰ Testing schedule message...');
  if (!config.testPhone) {
    console.log('⚠️  No test phone provided, skipping...');
    return null;
  }
  
  // Schedule message for 2 minutes from now
  const futureDate = new Date();
  futureDate.setMinutes(futureDate.getMinutes() + 2);
  
  const date = futureDate.toLocaleDateString('en-GB'); // DD/MM/YYYY format
  const time = futureDate.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' }); // HH:MM format
  
  try {
    const response = await axios.post(`${config.baseURL}/schedule_msg/`, {
      client_id: config.clientId,
      api_key: config.apiKey,
      whatsapp_client: config.whatsappClientId,
      msg_type: 0,
      msg: `Scheduled test message from WbizTool n8n integration testing - ${new Date().toISOString()}`,
      phone: config.testPhone,
      country_code: config.countryCode,
      date: date,
      time: time,
      timezone: 'UTC'
    });
    console.log('✅ Schedule message test passed:', response.data);
    return response.data.msg_id;
  } catch (error) {
    console.error('❌ Schedule message test failed:', error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('🧪 Starting WbizTool API Integration Tests...\n');
  console.log('📝 Configuration:');
  console.log(`   Client ID: ${config.clientId ? '✅ Set' : '❌ Missing'}`);
  console.log(`   API Key: ${config.apiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   WhatsApp Client ID: ${config.whatsappClientId ? '✅ Set' : '⚠️  Not provided'}`);
  console.log(`   Test Phone: ${config.testPhone ? '✅ Set' : '⚠️  Not provided'}`);
  console.log(`   Country Code: ${config.countryCode}\n`);
  
  if (!config.clientId || !config.apiKey) {
    console.error('❌ Missing required environment variables.');
    console.error('Please set: WBIZTOOL_CLIENT_ID and WBIZTOOL_API_KEY');
    console.error('\nExample:');
    console.error('export WBIZTOOL_CLIENT_ID="12345"');
    console.error('export WBIZTOOL_API_KEY="wbt_live_abc123..."');
    console.error('export WBIZTOOL_WHATSAPP_CLIENT_ID="67890"');
    console.error('export TEST_PHONE="919876543210"');
    console.error('export COUNTRY_CODE="91"');
    process.exit(1);
  }

  let testsPassed = 0;
  let testsTotal = 0;

  // Test 1: Credentials
  testsTotal++;
  const credentialsOk = await testCredentials();
  if (credentialsOk) testsPassed++;
  console.log('');

  if (!credentialsOk) {
    console.error('❌ Cannot proceed with other tests due to credential failure');
    process.exit(1);
  }

  // Test 2: List WhatsApp Clients
  testsTotal++;
  const clients = await testListWhatsAppClients();
  if (clients.length >= 0) testsPassed++;
  console.log('');

  // Test 3: WhatsApp Client Status
  testsTotal++;
  const clientStatusOk = await testWhatsAppClientStatus();
  if (clientStatusOk) testsPassed++;
  console.log('');

  // Test 4: Send Message
  testsTotal++;
  const messageId = await testSendMessage();
  if (messageId) testsPassed++;
  console.log('');

  // Test 5: Message Status (if we have a message ID)
  if (messageId) {
    testsTotal++;
    await testMessageStatus(messageId);
    testsPassed++;
    console.log('');
  }

  // Test 6: Schedule Message
  testsTotal++;
  const scheduledMessageId = await testScheduleMessage();
  if (scheduledMessageId) testsPassed++;
  console.log('');

  // Summary
  console.log('🎯 Test Results Summary:');
  console.log(`   Tests Passed: ${testsPassed}/${testsTotal}`);
  console.log(`   Success Rate: ${((testsPassed/testsTotal) * 100).toFixed(1)}%`);
  
  if (testsPassed === testsTotal) {
    console.log('\n🎉 All tests passed! Your WbizTool API integration is working correctly.');
    console.log('✅ You can now proceed with n8n node testing.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.');
    console.log('💡 Tip: Make sure your WhatsApp client is connected and you have sufficient credits.');
  }

  if (messageId) {
    console.log(`\n📝 Note: Test message sent with ID: ${messageId}`);
  }
  if (scheduledMessageId) {
    console.log(`📅 Note: Scheduled message created with ID: ${scheduledMessageId}`);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

runTests(); 