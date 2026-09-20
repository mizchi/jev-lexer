//! A tiny LRU cache. See https://example.com/docs/cache for the design notes.
use std::collections::HashMap;
use std::hash::Hash;

/// Maximum number of entries before the oldest is evicted.
pub const DEFAULT_CAPACITY: usize = 1_024;
const TICK_NS: u64 = 1e3 as u64;
const MASK: u32 = 0xFF;

/* A node keeps the value and the tick at which it was last read.
 * Ticks are monotonic per cache, not wall clock.
 * Two caches never compare ticks. */
#[derive(Debug, Clone)]
struct Entry<V> {
    value: V,
    tick: u64,
}

#[derive(Debug)]
pub enum CacheError {
    Full,
    Missing(String),
}

pub struct LruCache<K, V> {
    map: HashMap<K, Entry<V>>,
    capacity: usize,
    tick: u64,
}

impl<K: Eq + Hash + Clone, V> LruCache<K, V> {
    pub fn new(capacity: usize) -> Self {
        Self { map: HashMap::with_capacity(capacity), capacity, tick: 0 }
    }

    fn next_tick(&mut self) -> u64 {
        self.tick += TICK_NS;
        self.tick
    }

    pub fn get(&mut self, key: &K) -> Option<&V> {
        let tick = self.next_tick();
        match self.map.get_mut(key) {
            Some(entry) => {
                entry.tick = tick;
                Some(&entry.value)
            }
            None => None,
        }
    }

    // TODO: evict_oldest() is O(n); use a linked list if capacity grows past 1e4
    pub fn insert(&mut self, key: K, value: V) -> Result<(), CacheError> {
        if self.map.len() >= self.capacity && !self.map.contains_key(&key) {
            self.evict_oldest();
        }
        let tick = self.next_tick();
        self.map.insert(key, Entry { value, tick });
        Ok(())
    }

    fn evict_oldest(&mut self) {
        let oldest = self.map.iter().min_by_key(|(_, e)| e.tick).map(|(k, _)| k.clone());
        if let Some(k) = oldest {
            self.map.remove(&k);
        }
    }

    pub fn describe(&self) -> String {
        format!("cache with {} of {} entries; use match or return to read it", self.map.len(), self.capacity)
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b & (MASK as u8))).collect::<Vec<_>>().join("")
}

pub fn in_range(n: u32) -> bool {
    matches!(n, 0..=255) && n != u32::MAX
}
