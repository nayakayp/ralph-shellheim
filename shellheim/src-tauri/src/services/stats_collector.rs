//! Server stats collector - collects system metrics via SSH commands

use std::collections::HashMap;

/// Raw stats collected from a server
#[derive(Debug, Default)]
pub struct RawServerStats {
    // CPU
    pub cpu_usage_percent: Option<f64>,
    pub cpu_cores: Option<i32>,
    pub load_avg_1: Option<f64>,
    pub load_avg_5: Option<f64>,
    pub load_avg_15: Option<f64>,
    // Memory (bytes)
    pub memory_total: Option<i64>,
    pub memory_used: Option<i64>,
    pub memory_free: Option<i64>,
    pub memory_cached: Option<i64>,
    pub swap_total: Option<i64>,
    pub swap_used: Option<i64>,
    // Disk (bytes)
    pub disk_total: Option<i64>,
    pub disk_used: Option<i64>,
    pub disk_free: Option<i64>,
    pub disk_path: String,
    // Network
    pub net_rx_bytes: Option<i64>,
    pub net_tx_bytes: Option<i64>,
    pub net_interface: String,
    // System
    pub uptime_seconds: Option<i64>,
    pub os_name: Option<String>,
    pub kernel_version: Option<String>,
    pub hostname: Option<String>,
}

/// The shell command that collects all stats in one go
/// This is more efficient than running multiple SSH commands
pub const STATS_COLLECTION_SCRIPT: &str = r#"
echo "===HOSTNAME==="
hostname 2>/dev/null || cat /etc/hostname 2>/dev/null || echo "unknown"

echo "===KERNEL==="
uname -r 2>/dev/null || echo "unknown"

echo "===OS==="
if [ -f /etc/os-release ]; then
    grep "^PRETTY_NAME=" /etc/os-release | cut -d'"' -f2
elif [ -f /etc/redhat-release ]; then
    cat /etc/redhat-release
else
    uname -s
fi

echo "===UPTIME==="
cat /proc/uptime 2>/dev/null | cut -d' ' -f1 || echo "0"

echo "===LOADAVG==="
cat /proc/loadavg 2>/dev/null || echo "0 0 0"

echo "===CPUCORES==="
grep -c ^processor /proc/cpuinfo 2>/dev/null || echo "1"

echo "===CPUSTAT==="
head -1 /proc/stat 2>/dev/null || echo "cpu 0 0 0 0 0 0 0 0 0 0"

echo "===MEMINFO==="
cat /proc/meminfo 2>/dev/null || echo ""

echo "===DISKSTAT==="
df -B1 / 2>/dev/null | tail -1 || echo "0 0 0"

echo "===NETSTAT==="
cat /proc/net/dev 2>/dev/null | grep -E "eth0|ens|enp" | head -1 || echo ""

echo "===END==="
"#;

/// Parse the output of the stats collection script
pub fn parse_stats_output(output: &str) -> RawServerStats {
    let mut stats = RawServerStats::default();
    stats.disk_path = "/".to_string();
    stats.net_interface = "eth0".to_string();
    
    let mut current_section = "";
    let mut lines_buffer: Vec<&str> = Vec::new();
    
    for line in output.lines() {
        let line = line.trim();
        
        if line.starts_with("===") && line.ends_with("===") {
            // Process previous section
            if !current_section.is_empty() {
                process_section(&mut stats, current_section, &lines_buffer);
            }
            current_section = line.trim_matches('=');
            lines_buffer.clear();
        } else if !line.is_empty() {
            lines_buffer.push(line);
        }
    }
    
    stats
}

fn process_section(stats: &mut RawServerStats, section: &str, lines: &[&str]) {
    match section {
        "HOSTNAME" => {
            if let Some(line) = lines.first() {
                stats.hostname = Some(line.to_string());
            }
        }
        "KERNEL" => {
            if let Some(line) = lines.first() {
                stats.kernel_version = Some(line.to_string());
            }
        }
        "OS" => {
            if let Some(line) = lines.first() {
                stats.os_name = Some(line.to_string());
            }
        }
        "UPTIME" => {
            if let Some(line) = lines.first() {
                if let Ok(uptime) = line.parse::<f64>() {
                    stats.uptime_seconds = Some(uptime as i64);
                }
            }
        }
        "LOADAVG" => {
            if let Some(line) = lines.first() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    stats.load_avg_1 = parts[0].parse().ok();
                    stats.load_avg_5 = parts[1].parse().ok();
                    stats.load_avg_15 = parts[2].parse().ok();
                }
            }
        }
        "CPUCORES" => {
            if let Some(line) = lines.first() {
                stats.cpu_cores = line.parse().ok();
            }
        }
        "CPUSTAT" => {
            // Parse /proc/stat for CPU usage (simplified)
            // Format: cpu user nice system idle iowait irq softirq steal guest guest_nice
            if let Some(line) = lines.first() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 5 && parts[0] == "cpu" {
                    let user: u64 = parts[1].parse().unwrap_or(0);
                    let nice: u64 = parts[2].parse().unwrap_or(0);
                    let system: u64 = parts[3].parse().unwrap_or(0);
                    let idle: u64 = parts[4].parse().unwrap_or(0);
                    let iowait: u64 = parts.get(5).and_then(|s| s.parse().ok()).unwrap_or(0);
                    
                    let total = user + nice + system + idle + iowait;
                    let active = user + nice + system;
                    
                    if total > 0 {
                        stats.cpu_usage_percent = Some((active as f64 / total as f64) * 100.0);
                    }
                }
            }
        }
        "MEMINFO" => {
            let mut meminfo: HashMap<String, i64> = HashMap::new();
            for line in lines {
                if let Some((key, value)) = parse_meminfo_line(line) {
                    meminfo.insert(key, value);
                }
            }
            
            stats.memory_total = meminfo.get("MemTotal").copied();
            stats.memory_free = meminfo.get("MemFree").copied();
            stats.memory_cached = meminfo.get("Cached").copied();
            stats.swap_total = meminfo.get("SwapTotal").copied();
            
            // Calculate used memory
            if let (Some(total), Some(free)) = (stats.memory_total, stats.memory_free) {
                let cached = stats.memory_cached.unwrap_or(0);
                let buffers = meminfo.get("Buffers").copied().unwrap_or(0);
                stats.memory_used = Some(total - free - cached - buffers);
            }
            
            // Calculate used swap
            if let (Some(total), Some(free)) = (stats.swap_total, meminfo.get("SwapFree").copied()) {
                stats.swap_used = Some(total - free);
            }
        }
        "DISKSTAT" => {
            // Parse df output
            // Format varies, but typically: Filesystem Size Used Avail Use% Mounted
            // With -B1: all values in bytes
            for line in lines {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 4 {
                    // Try to parse as numbers (bytes)
                    stats.disk_total = parts[1].parse().ok();
                    stats.disk_used = parts[2].parse().ok();
                    stats.disk_free = parts[3].parse().ok();
                    break;
                }
            }
        }
        "NETSTAT" => {
            // Parse /proc/net/dev line
            // Format: interface: rx_bytes rx_packets ... tx_bytes tx_packets ...
            for line in lines {
                if let Some(colon_pos) = line.find(':') {
                    let interface = line[..colon_pos].trim();
                    stats.net_interface = interface.to_string();
                    
                    let values: Vec<&str> = line[colon_pos + 1..].split_whitespace().collect();
                    if values.len() >= 9 {
                        stats.net_rx_bytes = values[0].parse().ok();
                        stats.net_tx_bytes = values[8].parse().ok();
                    }
                    break;
                }
            }
        }
        _ => {}
    }
}

/// Parse a line from /proc/meminfo
/// Format: "MemTotal:       16384000 kB"
fn parse_meminfo_line(line: &str) -> Option<(String, i64)> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() >= 2 {
        let key = parts[0].trim_end_matches(':').to_string();
        let value: i64 = parts[1].parse().ok()?;
        // Convert from kB to bytes if unit is specified
        let multiplier = if parts.len() >= 3 && parts[2].to_lowercase() == "kb" {
            1024
        } else {
            1
        };
        return Some((key, value * multiplier));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_meminfo_line() {
        assert_eq!(
            parse_meminfo_line("MemTotal:       16384000 kB"),
            Some(("MemTotal".to_string(), 16384000 * 1024))
        );
    }
    
    #[test]
    fn test_parse_stats_output() {
        let sample = r#"
===HOSTNAME===
myserver
===KERNEL===
5.15.0-generic
===OS===
Ubuntu 22.04 LTS
===UPTIME===
123456.78
===LOADAVG===
0.50 0.75 0.85 1/234 5678
===CPUCORES===
4
===CPUSTAT===
cpu  12345 100 5000 80000 500 0 0 0 0 0
===MEMINFO===
MemTotal:       16384000 kB
MemFree:         8192000 kB
Cached:          2048000 kB
Buffers:          512000 kB
SwapTotal:       4096000 kB
SwapFree:        3072000 kB
===DISKSTAT===
/dev/sda1 100000000000 50000000000 45000000000 53% /
===NETSTAT===
  eth0: 1234567890 1000000 0 0 0 0 0 0 9876543210 500000 0 0 0 0 0 0
===END===
"#;
        
        let stats = parse_stats_output(sample);
        
        assert_eq!(stats.hostname, Some("myserver".to_string()));
        assert_eq!(stats.kernel_version, Some("5.15.0-generic".to_string()));
        assert_eq!(stats.os_name, Some("Ubuntu 22.04 LTS".to_string()));
        assert_eq!(stats.uptime_seconds, Some(123456));
        assert_eq!(stats.load_avg_1, Some(0.50));
        assert_eq!(stats.load_avg_5, Some(0.75));
        assert_eq!(stats.load_avg_15, Some(0.85));
        assert_eq!(stats.cpu_cores, Some(4));
        assert!(stats.memory_total.is_some());
        assert!(stats.net_rx_bytes.is_some());
    }
}
