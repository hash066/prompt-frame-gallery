const fetch = require('node-fetch').default;

async function testAPI() {
  try {
    console.log('🔍 Testing API endpoints...');
    
    // Test health endpoint
    console.log('\n1. Testing health endpoint...');
    const healthResponse = await fetch('http://localhost:3001/api/health');
    console.log('Health Status:', healthResponse.status);
    const healthData = await healthResponse.json();
    console.log('Health Data:', JSON.stringify(healthData, null, 2));
    
    // Test images list endpoint
    console.log('\n2. Testing images list endpoint...');
    const imagesResponse = await fetch('http://localhost:3001/api/images');
    console.log('Images Status:', imagesResponse.status);
    const imagesData = await imagesResponse.json();
    console.log('Images found:', imagesData.length);
    
    if (imagesData.length > 0) {
      const firstImage = imagesData[0];
      console.log('First image:', {
        id: firstImage.id,
        filename: firstImage.filename,
        status: firstImage.status
      });
      
      // Test image download endpoint
      console.log('\n3. Testing image download endpoint...');
      const downloadUrl = `http://localhost:3001/api/images/${firstImage.id}/download?variant=thumbnail`;
      console.log('Download URL:', downloadUrl);
      
      const downloadResponse = await fetch(downloadUrl);
      console.log('Download Status:', downloadResponse.status);
      console.log('Content-Type:', downloadResponse.headers.get('content-type'));
      console.log('Content-Length:', downloadResponse.headers.get('content-length'));
      
      if (downloadResponse.ok) {
        console.log('✅ Image download successful!');
      } else {
        const errorText = await downloadResponse.text();
        console.log('❌ Download failed:', errorText);
      }
    } else {
      console.log('No images found in database');
    }
    
  } catch (error) {
    console.error('❌ Error testing API:', error.message);
  }
}

testAPI();
