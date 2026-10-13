# shellcheck shell=sh
# Sourced (not executed) by backup.sh and deploy.sh.
#
# load_env_keys FILE PATTERN
#   Exports the KEY=VALUE lines of FILE whose key matches the extended regex PATTERN (anchored), e.g.
#   'OFFSITE_[A-Z0-9_]+'. Safer than sourcing the whole .env: nothing in it is executed, only matching keys
#   are read, one pair of surrounding quotes is stripped, and a variable that is ALREADY set in the
#   environment wins (so `OFFSITE_RCLONE_REMOTE= ./backup.sh` can still switch a setting off for one run).
#   A missing or unreadable FILE is silently ignored. PATTERN must only match shell identifiers.
load_env_keys() {
  _lek_file=$1
  _lek_pattern=$2
  [ -r "$_lek_file" ] || return 0
  # grep -E selects candidate lines; `|| true` because "no match" is not an error here.
  _lek_lines=$(grep -E "^(${_lek_pattern})=" "$_lek_file" || true)
  [ -n "$_lek_lines" ] || return 0
  # A here-document (not a pipe) keeps the loop in this shell, so the exports survive it.
  while IFS= read -r _lek_line; do
    _lek_key=${_lek_line%%=*}
    _lek_value=${_lek_line#*=}
    # Strip a trailing CR (a .env edited on Windows) and one pair of surrounding quotes.
    _lek_value=$(printf '%s' "$_lek_value" | tr -d '\r')
    case $_lek_value in
      \"*\") _lek_value=${_lek_value#\"}; _lek_value=${_lek_value%\"} ;;
      \'*\') _lek_value=${_lek_value#\'}; _lek_value=${_lek_value%\'} ;;
      *)
        # Unquoted: drop an inline " # comment" and trailing blanks, as docker compose does.
        _lek_value=${_lek_value%%[[:space:]]#*}
        _lek_value=$(printf '%s' "$_lek_value" | sed 's/[[:space:]]*$//')
        ;;
    esac
    # Only set keys the caller has not set already (an empty-but-set variable counts as set).
    if eval "[ -z \"\${${_lek_key}+x}\" ]"; then
      export "$_lek_key=$_lek_value"
    fi
  done <<EOF
$_lek_lines
EOF
}
