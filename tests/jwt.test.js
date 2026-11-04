const { sign, verify } = require('../utils/jwt');
describe('JWT helper', () => {
  const secret = 'test-secret-for-unit-tests';
  test('signs and verifies a payload', () => {
    const token = sign({id:7,role:'student'},secret,'1h');
    expect(verify(token,secret).id).toBe(7);
    expect(verify(token,secret).role).toBe('student');
  });
  test('rejects a modified token', () => {
    const token = sign({id:7,role:'student'},secret,'1h');
    expect(() => verify(token+'x',secret)).toThrow();
  });
});
