class MockStateQueryIterator {
  constructor(data) {
    this.data = data;
    this.currentLoc = 0;
    this.closed = false;
  }

  get response() {
    return {
      results: this.data,
      has_more: this.data.length - (this.currentLoc + 1) >= 0,
      metadata: Buffer.from(""),
      id: "mockId",
    };
  }

  next() {
    if (this.closed) {
      throw new Error("Iterator has already been closed");
    }

    this.currentLoc += 1;

    return Promise.resolve({
      value: this.data[this.currentLoc - 1],
      done: this.data.length < this.currentLoc,
    });
  }

  async close() {
    this.closed = true;
  }
}

module.exports.MockStateQueryIterator = MockStateQueryIterator;
