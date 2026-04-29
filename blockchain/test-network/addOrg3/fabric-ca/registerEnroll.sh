#!/usr/bin/env bash
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#

function createOrg3 {
	infoln "Enrolling the CA admin"
	mkdir -p ../organizations/peerOrganizations/distributor.drugguard.vn/

	export FABRIC_CA_CLIENT_HOME=${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/

  set -x
  fabric-ca-client enroll -u https://admin:adminpw@localhost:11054 --caname ca-org3 --tls.certfiles "${PWD}/fabric-ca/org3/tls-cert.pem"
  { set +x; } 2>/dev/null

  echo 'NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/localhost-11054-ca-org3.pem
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/localhost-11054-ca-org3.pem
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/localhost-11054-ca-org3.pem
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/localhost-11054-ca-org3.pem
    OrganizationalUnitIdentifier: orderer' > "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/msp/config.yaml"

	infoln "Registering peer0"
  set -x
	fabric-ca-client register --caname ca-org3 --id.name peer0 --id.secret peer0pw --id.type peer --tls.certfiles "${PWD}/fabric-ca/org3/tls-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Registering user"
  set -x
  fabric-ca-client register --caname ca-org3 --id.name user1 --id.secret user1pw --id.type client --tls.certfiles "${PWD}/fabric-ca/org3/tls-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Registering the org admin"
  set -x
  fabric-ca-client register --caname ca-org3 --id.name org3admin --id.secret org3adminpw --id.type admin --tls.certfiles "${PWD}/fabric-ca/org3/tls-cert.pem"
  { set +x; } 2>/dev/null

  infoln "Generating the peer0 msp"
  set -x
	fabric-ca-client enroll -u https://peer0:peer0pw@localhost:11054 --caname ca-org3 -M "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/peers/peer0.distributor.drugguard.vn/msp" --tls.certfiles "${PWD}/fabric-ca/org3/tls-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/msp/config.yaml" "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/peers/peer0.distributor.drugguard.vn/msp/config.yaml"

  infoln "Generating the peer0-tls certificates, use --csr.hosts to specify Subject Alternative Names"
  set -x
  fabric-ca-client enroll -u https://peer0:peer0pw@localhost:11054 --caname ca-org3 -M "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/peers/peer0.distributor.drugguard.vn/tls" --enrollment.profile tls --csr.hosts peer0.distributor.drugguard.vn --csr.hosts localhost --tls.certfiles "${PWD}/fabric-ca/org3/tls-cert.pem"
  { set +x; } 2>/dev/null


  cp "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/peers/peer0.distributor.drugguard.vn/tls/tlscacerts/"* "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/peers/peer0.distributor.drugguard.vn/tls/ca.crt"
  cp "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/peers/peer0.distributor.drugguard.vn/tls/signcerts/"* "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/peers/peer0.distributor.drugguard.vn/tls/server.crt"
  cp "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/peers/peer0.distributor.drugguard.vn/tls/keystore/"* "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/peers/peer0.distributor.drugguard.vn/tls/server.key"

  mkdir "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/msp/tlscacerts"
  cp "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/peers/peer0.distributor.drugguard.vn/tls/tlscacerts/"* "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/msp/tlscacerts/ca.crt"

  mkdir "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/tlsca"
  cp "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/peers/peer0.distributor.drugguard.vn/tls/tlscacerts/"* "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/tlsca/tlsca.distributor.drugguard.vn-cert.pem"

  mkdir "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/ca"
  cp "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/peers/peer0.distributor.drugguard.vn/msp/cacerts/"* "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/ca/ca.distributor.drugguard.vn-cert.pem"

  infoln "Generating the user msp"
  set -x
	fabric-ca-client enroll -u https://user1:user1pw@localhost:11054 --caname ca-org3 -M "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/users/User1@distributor.drugguard.vn/msp" --tls.certfiles "${PWD}/fabric-ca/org3/tls-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/msp/config.yaml" "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/users/User1@distributor.drugguard.vn/msp/config.yaml"

  infoln "Generating the org admin msp"
  set -x
	fabric-ca-client enroll -u https://org3admin:org3adminpw@localhost:11054 --caname ca-org3 -M "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/users/Admin@distributor.drugguard.vn/msp" --tls.certfiles "${PWD}/fabric-ca/org3/tls-cert.pem"
  { set +x; } 2>/dev/null

  cp "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/msp/config.yaml" "${PWD}/../organizations/peerOrganizations/distributor.drugguard.vn/users/Admin@distributor.drugguard.vn/msp/config.yaml"
}
