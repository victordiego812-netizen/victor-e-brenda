const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {validSignature,contributionNet}=require('../api/contributions');
test('accepts only a matching payment notification signature',()=>{
 const sig=createHmac('sha256','secret').update('id:123;request-id:request;ts:1704908010;').digest('hex');
 assert.equal(validSignature('123','request','ts=1704908010,v1='+sig,'secret'),true);
 assert.equal(validSignature('124','request','ts=1704908010,v1='+sig,'secret'),false);
 assert.equal(validSignature('123','request','ts=1704908010,v1=00','secret'),false);
});
test('progress uses approved net amounts and reverses refunds',()=>{
 assert.equal(contributionNet({status:'pending',transaction_amount:100}),0);
 assert.equal(contributionNet({status:'approved',transaction_amount:100,fee_details:[{amount:.99}]}),9901);
 assert.equal(contributionNet({status:'approved',transaction_amount:100,transaction_amount_refunded:50,fee_details:[{amount:.99}]}),4901);
 assert.equal(contributionNet({status:'refunded',transaction_amount:100}),0);
 assert.equal(contributionNet({status:'charged_back',transaction_amount:100}),0);
});
test('checkout remains unavailable before configuration',async()=>{
 const handler=require('../api/contributions');
 const previous=process.env.WEDDING_PAYMENTS_ENABLED;
 delete process.env.WEDDING_PAYMENTS_ENABLED;
 let code,result;
 const res={setHeader(){},status(c){code=c;return this},json(v){result=v;return this}};
 await handler({method:'GET'},res);assert.equal(result.enabled,false);
 await handler({method:'POST',query:{},body:{action:'create'},headers:{}},res);
 assert.equal(code,503);assert.match(result.error,/em breve/);
 if(previous!==undefined)process.env.WEDDING_PAYMENTS_ENABLED=previous;
});
