const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://lcahzqvrsqxievglvkib.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjYWh6cXZyc3F4aWV2Z2x2a2liIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDk1MDQ3NiwiZXhwIjoyMDk2NTI2NDc2fQ.J4m-C19Ve4GpgE-dET4UCqVUx8KoFNypwCN8_AJAlKE';

const headers = {
  'apikey': serviceKey,
  'Authorization': `Bearer ${serviceKey}`,
  'Content-Type': 'application/json'
};

async function fetchSupa(table) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
    headers,
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${table}: ${res.status}`);
  }
  return await res.json();
}

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function run() {
  const statements = [];
  
  const tables = [
    { name: 'partners', d1Name: 'd1_partners', keys: ['id', 'code', 'name', 'email', 'password_hash', 'active', 'suspended', 'banned', 'revenue_split', 'full_stats', 'payout_currency', 'payout_address', 'created_at'] },
    { name: 'partner_balances', d1Name: 'd1_partner_balances', keys: ['partner_id', 'earned', 'hold', 'paid', 'balance'] },
    { name: 'partner_zones', d1Name: 'd1_partner_zones', keys: ['id', 'partner_id', 'zone_id', 'label', 'format', 'full_tag', 'gross_seen', 'last_impressions', 'created_at'] },
    { name: 'partner_applications', d1Name: 'd1_partner_applications', keys: ['id', 'name', 'email', 'country', 'platform', 'audience_size', 'contact_handle', 'status', 'reviewed_at', 'created_at'] },
    { name: 'partner_payouts', d1Name: 'd1_partner_payouts', keys: ['id', 'partner_id', 'amount', 'currency', 'method', 'from_address', 'to_address', 'status', 'proof_link', 'proof_image', 'note', 'fail_reason', 'created_at', 'updated_at'] },
    { name: 'stream_overrides', d1Name: 'd1_stream_overrides', keys: ['id', 'match_id', 'match_data', 'embed_url', 'source', 'server_label', 'replace_original', 'position', 'enabled', 'hd', 'created_at'] },
    { name: 'match_flags', d1Name: 'd1_match_flags', keys: ['match_id', 'hidden', 'forced_live', 'featured', 'disable_auto', 'auto_fallback', 'match_data', 'display_title', 'force_ended', 'hot', 'updated_at'] },
    { name: 'site_settings', d1Name: 'd1_site_settings', keys: ['key', 'value', 'updated_at'] },
    { name: 'tv_channels', d1Name: 'd1_tv_channels', keys: ['id', 'name', 'logo', 'embed_url', 'enabled', 'position', 'created_at'] },
    { name: 'push_match_state', d1Name: 'd1_push_match_state', keys: ['match_key', 'home_team', 'away_team', 'finished', 'updated_at'] },
    { name: 'league_config', d1Name: 'd1_league_config', keys: ['league_id', 'label', 'enabled', 'display_order', 'has_table', 'default_tab', 'logo_url', 'updated_at'] },
    { name: 'league_matches', d1Name: 'd1_league_matches', keys: ['match_key', 'league_id', 'season_id', 'home_team', 'away_team', 'home_score', 'away_score', 'group_name', 'round_number', 'round_name', 'event_date', 'status', 'updated_at'] },
    { name: 'league_standings', d1Name: 'd1_league_standings', keys: ['league_id', 'grouped', 'season_name', 'standings', 'updated_at'] },
    { name: 'league_teams', d1Name: 'd1_league_teams', keys: ['name', 'crest_url', 'updated_at'] },
    { name: 'cricket_streams', d1Name: 'd1_cricket_streams', keys: ['id', 'title', 'competition', 'starts_at', 'time', 'status', 'channel_ids', 'created_at'] },
    { name: 'push_subscriptions', d1Name: 'd1_push_subscriptions', keys: ['endpoint', 'p256dh', 'auth', 'topics', 'prefs', 'user_agent', 'last_seen_at', 'created_at', 'sent_count', 'open_count', 'last_opened_at'] },
    { name: 'match_follows', d1Name: 'd1_match_follows', keys: ['team_key', 'endpoint', 'title', 'created_at'] }
  ];

  for (const t of tables) {
    console.log(`Fetching table ${t.name}...`);
    try {
      const rows = await fetchSupa(t.name);
      console.log(`Fetched ${rows.length} rows for ${t.name}.`);
      
      if (t.name === 'stream_overrides') {
        statements.push('DELETE FROM d1_stream_overrides;');
      }
      
      for (const r of rows) {
        // Map any field aliases or fallback fields
        if (t.name === 'partners') {
          r.password_hash = r.password_hash || r.password || r.password_encrypted || "";
        }
        
        const cols = t.keys.join(', ');
        const vals = t.keys.map(k => {
          if (t.name === 'tv_channels' && k === 'embed_url' && (r[k] === null || r[k] === undefined)) {
            return "''";
          }
          return escapeSql(r[k]);
        }).join(', ');
        
        if (t.name === 'stream_overrides') {
          statements.push(`INSERT INTO ${t.d1Name} (${cols}) VALUES (${vals});`);
        } else {
          // Use INSERT OR REPLACE or ON CONFLICT to make it idempotent
          let conflictKey = t.keys[0];
          if (t.name === 'match_follows') {
            conflictKey = 'team_key, endpoint';
          }
          
          const updates = t.keys.filter(k => k !== 'id' && k !== 'key' && k !== 'endpoint' && k !== 'league_id' && k !== 'match_key' && k !== 'name' && k !== 'partner_id' && k !== 'team_key').map(k => `${k}=excluded.${k}`).join(', ');
          
          if (updates) {
            statements.push(`INSERT INTO ${t.d1Name} (${cols}) VALUES (${vals}) ON CONFLICT(${conflictKey}) DO UPDATE SET ${updates};`);
          } else {
            statements.push(`INSERT OR IGNORE INTO ${t.d1Name} (${cols}) VALUES (${vals});`);
          }
        }
      }
    } catch (e) {
      console.error(`Error fetching/processing ${t.name}:`, e.message);
    }
  }

  const outPath = path.join(__dirname, '../migrations/data_seed.sql');
  fs.writeFileSync(outPath, statements.join('\n'));
  console.log(`Generated migration data seed file at: ${outPath}`);
}

run();
