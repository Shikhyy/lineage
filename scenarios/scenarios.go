// Package scenarios embeds the PayBench-BEC scenario files.
package scenarios

import "embed"

// FS holds the scenario JSON files.
//
//go:embed *.json
var FS embed.FS
