// Copyright 2012 Joyent, Inc.  All rights reserved.

var assert = require('assert');
var crypto = require('crypto');

var asn1 = require('asn1');
var ctype = require('ctype');



///--- Helpers

function readNext(buffer, offset) {
  var len = ctype.ruint32(buffer, 'big', offset);
  offset += 4;

  var newOffset = offset + len;

  return {
    data: buffer.slice(offset, newOffset),
    offset: newOffset
  };
}


function writeInt(writer, buffer) {
  writer.writeByte(0x02); // ASN1.Integer
  writer.writeLength(buffer.length);

  for (var i = 0; i < buffer.length; i++)
    writer.writeByte(buffer[i]);

  return writer;
}


function rsaToPEM(key) {
  var buffer;
  var der;
  var exponent;
  var i;
  var modulus;
  var newKey = '';
  var offset = 0;
  var type;
  var tmp;

  try {
    buffer = new Buffer(key.split(' ')[1], 'base64');

    tmp = readNext(buffer, offset);
    type = tmp.data.toString();
    offset = tmp.offset;

    if (type !== 'ssh-rsa')
      throw new Error('Invalid ssh key type: ' + type);

    tmp = readNext(buffer, offset);
    exponent = tmp.data;
    offset = tmp.offset;

    tmp = readNext(buffer, offset);
    modulus = tmp.data;
  } catch (e) {
    throw new Error('Invalid ssh key: ' + key);
  }

  // DER is a subset of BER
  der = new asn1.BerWriter();

  der.startSequence();

  der.startSequence();
  der.writeOID('1.2.840.113549.1.1.1');
  der.writeNull();
  der.endSequence();

  der.startSequence(0x03); // bit string
  der.writeByte(0x00);

  // Actual key
  der.startSequence();
  writeInt(der, modulus);
  writeInt(der, exponent);
  der.endSequence();

  // bit string
  der.endSequence();

  der.endSequence();

  tmp = der.buffer.toString('base64');
  for (i = 0; i < tmp.length; i++) {
    if ((i % 64) === 0)
      newKey += '\n';
    newKey += tmp.charAt(i);
  }

  if (!/\\n$/.test(newKey))
    newKey += '\n';

  return '-----BEGIN PUBLIC KEY-----' + newKey + '-----END PUBLIC KEY-----\n';
}


function dsaToPEM(key) {
  var buffer;
  var offset = 0;
  var tmp;
  var der;
  var newKey = '';

  var type;
  var p;
  var q;
  var g;
  var y;

  try {
    buffer = new Buffer(key.split(' ')[1], 'base64');

    tmp = readNext(buffer, offset);
    type = tmp.data.toString();
    offset = tmp.offset;

    /* JSSTYLED */
    if (!/^ssh-ds[as].*/.test(type))
      throw new Error('Invalid ssh key type: ' + type);

    tmp = readNext(buffer, offset);
    p = tmp.data;
    offset = tmp.offset;

    tmp = readNext(buffer, offset);
    q = tmp.data;
    offset = tmp.offset;

    tmp = readNext(buffer, offset);
    g = tmp.data;
    offset = tmp.offset;

    tmp = readNext(buffer, offset);
    y = tmp.data;
  } catch (e) {
    console.log(e.stack);
    throw new Error('Invalid ssh key: ' + key);
  }

  // DER is a subset of BER
  der = new asn1.BerWriter();

  der.startSequence();

  der.startSequence();
  der.writeOID('1.2.840.10040.4.1');

  der.startSequence();
  writeInt(der, p);
  writeInt(der, q);
  writeInt(der, g);
  der.endSequence();

  der.endSequence();

  der.startSequence(0x03); // bit string
  der.writeByte(0x00);
  writeInt(der, y);
  der.endSequence();

  der.endSequence();

  tmp = der.buffer.toString('base64');
  for (var i = 0; i < tmp.length; i++) {
    if ((i % 64) === 0)
      newKey += '\n';
    newKey += tmp.charAt(i);
  }

  if (!/\\n$/.test(newKey))
    newKey += '\n';

  return '-----BEGIN PUBLIC KEY-----' + newKey + '-----END PUBLIC KEY-----\n';
}


///--- API

  /**
   * Converts an OpenSSH public key (rsa only) to a PKCS#8 PEM file.
   *
   * The intent of this module is to interoperate with OpenSSL only,
   * specifically the node crypto module's `verify` method.
   *
   * @param {String} key an OpenSSH public key.
   * @return {String} PEM encoded form of the RSA public key.
   * @throws {TypeError} on bad input.
   * @throws {Error} on invalid ssh key formatted data.
   */
  function sshKeyToPEM(key) {
    assert.equal('string', typeof key, 'typeof ssh_key');

    /* JSSTYLED */
    if (/^ssh-rsa.*/.test(key))
      return rsaToPEM(key);

    /* JSSTYLED */
    if (/^ssh-ds[as].*/.test(key))
      return dsaToPEM(key);

    throw new Error('Only RSA and DSA public keys are allowed');
  }

module.exports = sshKeyToPEM
sshKeyToPEM.sshKeyToPEM = sshKeyToPEM


  /**
   * Generates an OpenSSH fingerprint from an ssh public key.
   *
   * @param {String} key an OpenSSH public key.
   * @return {String} key fingerprint.
   * @throws {TypeError} on bad input.
   * @throws {Error} if what you passed doesn't look like an ssh public key.
   */
  function fingerprint(key) {
    assert.equal('string', typeof key, 'typeof ssh_key');

    var pieces = key.split(' ');
    if (!pieces || !pieces.length || pieces.length < 2)
      throw new Error('invalid ssh key');

    var data = new Buffer(pieces[1], 'base64');

    var hash = crypto.createHash('md5');
    hash.update(data);
    var digest = hash.digest('hex');

    var fp = '';
    for (var i = 0; i < digest.length; i++) {
      if (i && i % 2 === 0)
        fp += ':';

      fp += digest[i];
    }

    return fp;
  }

sshKeyToPEM.fingerprint = fingerprint

