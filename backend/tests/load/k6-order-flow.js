import http from 'k6/http';
import { check, sleep } from 'k6';
export const options={stages:[{duration:'1m',target:20},{duration:'3m',target:50},{duration:'1m',target:0}]};
export default function(){
 const r=http.get(`${__ENV.BASE_URL}/v1/health`);
 check(r,{ 'healthy':x=>x.status===200 });
 sleep(1);
}
