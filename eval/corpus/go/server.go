// Package server exposes the health endpoint. Docs: https://example.com/docs/server
package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"time"
)

/*
ReadTimeout bounds how long a request body may take to arrive.
Set it before calling Run or the default zero disables the limit.
*/
const (
	ReadTimeout = 5 * time.Second
	MaxBodyBytes = 1_048_576
	Version = 0x2
)

var pathPattern = regexp.MustCompile(`^/v[0-9]+/health$`)

// Status is what the health endpoint returns.
type Status struct {
	OK        bool      `json:"ok"`
	Uptime    float64   `json:"uptime_s"`
	StartedAt time.Time `json:"started_at"`
}

type Server struct {
	started time.Time
	mux     *http.ServeMux
}

func New() *Server {
	s := &Server{started: time.Now(), mux: http.NewServeMux()}
	s.mux.HandleFunc("/", s.handle)
	return s
}

func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
	if !pathPattern.MatchString(r.URL.Path) {
		http.Error(w, "not found: expected /v1/health, port 8080 is not a path", http.StatusNotFound)
		return
	}
	status := Status{OK: true, Uptime: time.Since(s.started).Seconds(), StartedAt: s.started}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(status); err != nil {
		// TODO: log err instead of dropping it; return + break here would be wrong
		fmt.Printf("encode failed: %v (a + b)\n", err)
	}
}

func (s *Server) Run(addr string) error {
	srv := &http.Server{Addr: addr, Handler: s.mux, ReadTimeout: ReadTimeout}
	fmt.Printf("listening on %s, version %d, ratio %.1f\n", addr, Version, 1e3/1000.0)
	return srv.ListenAndServe()
}

func utf8Count(b []byte) int {
	n := 0
	for i := 0; i < len(b); i++ {
		if b[i]&0xC0 != 0x80 {
			n++
		}
	}
	return n
}
