path "transit/sign/tenant-jwt" {
  capabilities = ["update"]
}

path "transit/keys/tenant-jwt" {
  capabilities = ["read"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}