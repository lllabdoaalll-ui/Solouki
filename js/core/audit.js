(function(global){
  'use strict';
  async function record(actionKey, entityType, entityId, details){
    try{
      const sb=global.SoloukiDB.getClient();
      const {data,error}=await sb.rpc('record_audit_event',{
        p_action_key: actionKey,
        p_entity_type: entityType||null,
        p_entity_id: entityId==null?null:String(entityId),
        p_details: details||{}
      });
      if(error) console.warn('[Solouki] audit event failed:', error.message);
      return !error && !!data;
    }catch(e){console.warn('[Solouki] audit event exception:',e);return false;}
  }
  global.SoloukiAudit=Object.freeze({record});
})(window);
