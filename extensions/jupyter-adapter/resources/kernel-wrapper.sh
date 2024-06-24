#!/usr/bin/env bash

# ---------------------------------------------------------------------------------------------
# Copyright (C) 2023 Posit Software, PBC. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
# ---------------------------------------------------------------------------------------------

# This script is used to run a program and capture its output to a file. It is
# used to capture the output of the kernel process so that it can be displayed
# in the UI in the case of a startup failure; it may also be used in the future
# to perform Positron-specific kernel startup routines, such as setting up
# environment variables.

# Check that the user provided at least two arguments; the first is the output
# file and the second is the program to run and any arguments. If not, print a
# usage message and exit with an error code.
if [ $# -lt 2 ]; then
	echo "Usage: $0 <output-file> <program> [program-args...]" >&2
	exit 1
fi

# The first argument is the output file; consume it.
output_file="$1"
shift

# Start log file with current date
echo "*** Log started at $(date)" > "$output_file"

# Print the command line to the log file
echo "*** Command line:" >> "$output_file"
echo "$@" >> "$output_file"

# Run the program with its arguments, redirecting stdout and stderr to the output file
"$@" >> "$output_file" 2>&1

# Save the exit code of the program
exit_code=$?

# Emit the exit code of the program to the log file. Note that there is a log
# file parser in the Jupyter Adapter that specifically looks for the string
# "exit code XX" on the last line of the log, so don't change this without
# updating the parser!
echo "*** Log ended at $(date)" >> "$output_file"
echo "Process exit code ${exit_code}" >> "$output_file"

# Exit with the same code as the program so that the caller can correctly report errors
exit $exit_code
