"""Optional live smoke test; creates only QA support tickets, never sends mail.
Run prepare, then insert fixture SQL via the connected database, then run create.
Run finish after an admin reply; remove the returned QA IDs and point afterwards.
Credentials stay in a temporary mode-0600 file and never print.
"""
import json, pathlib, secrets, hashlib, uuid, urllib.request, urllib.error, sys, os
fixture=pathlib.Path('/private/tmp/pg-native-support-fixture.json')
endpoint='https://vyavhynnybsinkiievbu.supabase.co/functions/v1/pvz2-support'
key='sb_publishable_eIWwXJEBGxYAbnhOc-MKfw_NitfQtB_'
phase=sys.argv[1]
if phase=='prepare':
 f={'point':str(uuid.uuid4()),'member':str(uuid.uuid4()),'code':'qa-support-'+secrets.token_hex(4),'owner':secrets.token_hex(32),'staff':secrets.token_hex(32),'guest':secrets.token_hex(32),'requestId':str(uuid.uuid4())}
 fixture.write_text(json.dumps(f));fixture.chmod(0o600)
 h=lambda s:hashlib.sha256(s.encode()).hexdigest()
 sql=f"""insert into public.pvz2_companies(id,code,name,owner_salt,owner_hash,staff_salt,staff_hash,employees,config,rates) values('{f['point']}','{f['code']}','QA support isolated','unused','unused','unused','unused','["QA Employee"]','{{"positions":1,"opens":"08:00","closes":"20:00","days":[0,1,2,3,4,5,6]}}','{{"shift":1000,"hour":100}}');
insert into public.pvz2_members(id,company_id,employee_name,login,role,password_salt,password_hash,active,must_change_password) values('{f['member']}','{f['point']}','QA Employee','qa.support','staff','unused','unused',true,false);
insert into public.pvz2_sessions(token_hash,company_id,role,member_id,expires_at) values('{h(f['owner'])}','{f['point']}','owner',null,now()+interval '15 minutes'),('{h('pvz-v2-members:'+f['staff'])}','{f['point']}','staff','{f['member']}',now()+interval '15 minutes');
"""
 pathlib.Path('/private/tmp/pg-native-support-fixture.sql').write_text(sql);print(json.dumps({'prepared':True,'pointId':f['point']}));sys.exit()
f=json.loads(fixture.read_text());checks=[]
def call(action,expected=200,app=None,guest=None,legacy=False,**fields):
 body={'action':action,**fields};headers={'Origin':'https://po-grafiku.ru'}
 if legacy:
  headers.update({'Content-Type':'application/json','apikey':key})
  if app:headers['Authorization']='Bearer '+app
 else:
  headers['Content-Type']='text/plain;charset=UTF-8';body['transport']={'apikey':key}
  if app:body['transport']['token']=app
 if guest:body['guestKey']=guest
 req=urllib.request.Request(endpoint,json.dumps(body).encode(),headers)
 try:
  with urllib.request.urlopen(req,timeout=25) as r:code=r.status;result=json.load(r)
 except urllib.error.HTTPError as r:code=r.code;result=json.load(r)
 assert code==expected,(action,code,result.get('error'))
 checks.append({'action':action,'status':code});return result
base={'category':'bug','title':'QA support smoke test','message':'QA isolated support verification. No real user content.','email':'qa@example.invalid','pointCode':f['code']}
if phase=='create':
 call('adminList',expected=401,guest=f['guest'])
 call('supportList',expected=401,app='invalid')
 call('supportSubmit',expected=400,guest=f['guest'],**{**base,'message':'QA password: FakeCredential42'})
 g=call('supportSubmit',guest=f['guest'],requestId=f['requestId'],**base)['ticketId'];f['guestTicket']=g
 assert call('supportSubmit',guest=f['guest'],requestId=f['requestId'],**base)['ticketId']==g
 o=call('supportSubmit',app=f['owner'],requestId=str(uuid.uuid4()),**base)['ticketId'];f['ownerTicket']=o
 m=call('supportSubmit',app=f['staff'],legacy=True,requestId=str(uuid.uuid4()),**base)['ticketId'];f['staffTicket']=m
 assert len(call('supportList',guest=f['guest'])['tickets'])==1
 assert call('supportRead',guest=f['guest'],ticketId=g)['ticket']['sender_role']=='guest'
 assert call('supportRead',app=f['owner'],ticketId=o)['ticket']['sender_role']=='owner'
 assert call('supportRead',app=f['staff'],ticketId=m)['ticket']['sender_role']=='staff'
 call('supportRead',guest=f['guest'],ticketId=o,expected=404)
 call('supportRead',app=f['staff'],ticketId=o,expected=404)
 call('supportRead',guest=secrets.token_hex(32),ticketId=g,expected=404)
 call('supportReply',guest=f['guest'],ticketId=o,message='Forbidden',version=0,requestId=str(uuid.uuid4()),expected=404)
 call('supportSeen',guest=f['guest'],ticketId=o,seenAt='2026-10-15T00:00:00Z',expected=404)
 fixture.write_text(json.dumps(f));print(json.dumps({'passed':len(checks),'ticketIds':[g,o,m],'pointId':f['point']}))
elif phase=='finish':
 g=f['guestTicket'];r=call('supportRead',guest=f['guest'],ticketId=g)
 assert r['ticket']['status']=='resolved' and any(e['body']=='QA admin reply visible on site' for e in r['events'])
 call('supportSeen',guest=f['guest'],ticketId=g,seenAt=r['ticket']['last_admin_at'])
 rid=str(uuid.uuid4());fields={'ticketId':g,'message':'QA user follow-up','version':r['ticket']['support_version'],'requestId':rid}
 call('supportReply',guest=f['guest'],**fields);call('supportReply',guest=f['guest'],**fields)
 r=call('supportRead',guest=f['guest'],ticketId=g);assert r['ticket']['status']=='in_progress';assert len([e for e in r['events'] if e['body']=='QA user follow-up'])==1
 call('supportReply',guest=f['guest'],**{**fields,'requestId':str(uuid.uuid4())},expected=409)
 with urllib.request.urlopen(urllib.request.Request(endpoint.replace('/functions/v1/pvz2-support','/functions/v1/pvz-v2-rbac'),json.dumps({'action':'load','transport':{'apikey':key,'token':f['owner']}}).encode(),{'Origin':'https://po-grafiku.ru','Content-Type':'text/plain'}),timeout=25) as response:
  assert json.load(response)['company']['schedule']==[]
 print(json.dumps({'passed':len(checks),'existing_schedule_load':True,'pointId':f['point']}))
elif phase=='resume':
 g=f['guestTicket'];r=call('supportRead',guest=f['guest'],ticketId=g)
 assert r['ticket']['status']=='in_progress'
 assert len([e for e in r['events'] if e['body']=='QA user follow-up'])==1
 call('supportReply',guest=f['guest'],ticketId=g,message='QA stale reply',version=0,requestId=str(uuid.uuid4()),expected=409)
 with urllib.request.urlopen(urllib.request.Request(endpoint.replace('/functions/v1/pvz2-support','/functions/v1/pvz-v2-rbac'),json.dumps({'action':'load','transport':{'apikey':key,'token':f['owner']}}).encode(),{'Origin':'https://po-grafiku.ru','Content-Type':'text/plain'}),timeout=25) as response:
  assert json.load(response)['company']['schedule']==[]
 print(json.dumps({'passed':len(checks),'reply_read_reopen_deduplication':True,'existing_schedule_load':True}))
