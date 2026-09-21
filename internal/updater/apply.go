package updater

import (
	"fmt"
	"io"

	"github.com/minio/selfupdate"
)

// Apply replaces the executable at exePath with the contents of update, verifying it
// against checksum first when one is given (empty = skip verification — e.g. an older
// release cut before checksums were published). The previous binary is kept at
// exePath+".old" as a one-generation rollback rather than deleted outright.
func Apply(update io.Reader, exePath string, checksum []byte) error {
	opts := selfupdate.Options{
		TargetPath:  exePath,
		OldSavePath: exePath + ".old",
	}
	if len(checksum) > 0 {
		opts.Checksum = checksum
	}

	if err := selfupdate.Apply(update, opts); err != nil {
		if rerr := selfupdate.RollbackError(err); rerr != nil {
			return fmt.Errorf("update failed and the rollback also failed — please reinstall manually: %w", rerr)
		}
		return fmt.Errorf("update failed (your current version is untouched): %w", err)
	}
	return nil
}
